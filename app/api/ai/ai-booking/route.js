import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "../../../_lib/auth";
import {
  prepareAIReservation,
  createAIReservation,
} from "../../../_lib/ai-booking";
import { supabase } from "../../../_lib/supabase";

export const runtime = "nodejs";

function createConfirmationToken(payload) {
  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("Booking confirmation is not configured.");
  }

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

function verifyConfirmationToken(
  token,
  guestId,
  booking,
  allowExpired = false,
) {
  if (typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const expected = createHmac("sha256", secret).update(encoded).digest();

  let supplied;

  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  let payload;

  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const isValid =
    payload &&
    payload.guestId === guestId &&
    payload.cabinNumber === booking.cabinNumber &&
    payload.startDate === booking.startDate &&
    payload.endDate === booking.endDate &&
    payload.numGuests === booking.numGuests &&
    payload.observations === booking.observations &&
    typeof payload.expiresAt === "number" &&
    (allowExpired || payload.expiresAt > Date.now()) &&
    payload.quote &&
    typeof payload.quote.totalPrice === "number";

  return isValid ? payload : null;
}

export async function POST(request) {
  try {
    const session = await auth();

    if (!session?.user?.guestId) {
      return NextResponse.json(
        { error: "Please sign in before booking." },
        { status: 401 },
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 },
      );
    }

    const {
      action,
      cabinNumber,
      startDate,
      endDate,
      numGuests,
      observations = "",
      confirmationToken,
    } = body ?? {};

    if (
      !Number.isInteger(cabinNumber) ||
      cabinNumber < 1 ||
      cabinNumber > 8 ||
      !Number.isInteger(numGuests) ||
      numGuests < 1 ||
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      typeof observations !== "string" ||
      observations.length > 1000
    ) {
      return NextResponse.json(
        { error: "Invalid booking details." },
        { status: 400 },
      );
    }

    const bookingDetails = {
      cabinNumber,
      startDate,
      endDate,
      numGuests,
      observations,
    };

    // STEP 1: Prepare the reservation without creating a database booking.
    if (action === "prepare") {
      const proposal = await prepareAIReservation({
        ...bookingDetails,
      });

      const token = createConfirmationToken({
        ...bookingDetails,
        guestId: session.user.guestId,
        quote: proposal.booking,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return NextResponse.json({
        message:
          "Review the reservation details and explicitly confirm to continue.",
        confirmationToken: token,
        expiresInSeconds: 300,
        booking: proposal.booking,
      });
    }

    if (action !== "confirm") {
      return NextResponse.json(
        { error: "Unsupported action." },
        { status: 400 },
      );
    }

    // STEP 2: Verify the original signed token.

    const verifiedPayload = verifyConfirmationToken(
      confirmationToken,
      session.user.guestId,
      bookingDetails,
      true, // Verify the token even if it has expired.
    );

    if (!verifiedPayload) {
      return NextResponse.json(
        {
          error:
            "Confirmation is invalid or expired. Please review the booking again.",
        },
        { status: 400 },
      );
    }

    // Derive a stable identifier from the signed confirmation token.
    const confirmationId = createHash("sha256")
      .update(confirmationToken)
      .digest("hex");

    // First, check whether this confirmation already created a booking.
    const { data: existingBooking, error: lookupError } = await supabase
      .from("bookings")
      .select(
        "id, guestId, cabinId, startDate, endDate, numNights, numGuests, totalPrice, status",
      )
      .eq("confirmationId", confirmationId)
      .maybeSingle();

    if (lookupError) {
      console.error("Existing booking lookup failed:", lookupError);

      return NextResponse.json(
        { error: "Could not verify the booking confirmation." },
        { status: 500 },
      );
    }

    if (existingBooking) {
      if (existingBooking.guestId !== session.user.guestId) {
        return NextResponse.json(
          { error: "Invalid booking confirmation." },
          { status: 400 },
        );
      }

      // A previous request already created this booking.
      return NextResponse.json({
        message: "Reservation was already created.",
        booking: existingBooking,
        cabinNumber,
        alreadyCreated: true,
      });
    }

    // An expired token may retrieve an existing booking, but it must not
    // create a new booking.
    if (verifiedPayload.expiresAt <= Date.now()) {
      return NextResponse.json(
        {
          error:
            "Confirmation has expired. Please prepare and review the reservation again.",
        },
        { status: 400 },
      );
    }

    // Revalidate availability, capacity, and current price for a new booking.
    const currentProposal = await prepareAIReservation({
      ...bookingDetails,
    });

    const signedQuote = verifiedPayload.quote;
    const currentQuote = currentProposal.booking;

    const quoteFields = [
      "cabinNumber",
      "cabinName",
      "startDate",
      "endDate",
      "numGuests",
      "numNights",
      "nightlyPrice",
      "totalPrice",
      "observations",
    ];

    const quoteMatches = quoteFields.every(
      (field) => signedQuote[field] === currentQuote[field],
    );

    if (!quoteMatches) {
      return NextResponse.json(
        {
          error:
            "The reservation details or price have changed. Please prepare and review the reservation again.",
        },
        { status: 409 },
      );
    }

    // Create the booking only after all verification succeeds.
    const result = await createAIReservation({
      ...bookingDetails,
      confirmationId,
    });

    return NextResponse.json({
      message: result.alreadyCreated
        ? "Reservation was already created."
        : "Reservation created successfully.",
      ...result,
    });
  } catch (error) {
    if (error.code === "23P01") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("AI booking API error:", error);

    return NextResponse.json(
      { error: error.message || "Could not process the reservation." },
      { status: 500 },
    );
  }
}
