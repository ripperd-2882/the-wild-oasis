import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "../../_lib/auth";
import {
  prepareAIReservation,
  createAIReservation,
} from "../../_lib/ai-booking";

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

function verifyConfirmationToken(token, guestId, booking) {
  if (typeof token !== "string") return false;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(encoded).digest();

  let supplied;

  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return false;
  }

  let payload;

  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  return (
    payload.guestId === guestId &&
    payload.cabinNumber === booking.cabinNumber &&
    payload.startDate === booking.startDate &&
    payload.endDate === booking.endDate &&
    payload.numGuests === booking.numGuests &&
    payload.observations === booking.observations &&
    typeof payload.expiresAt === "number" &&
    payload.expiresAt > Date.now()
  );
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

    const body = await request.json();
    const {
      action,
      cabinNumber,
      startDate,
      endDate,
      numGuests,
      observations = "",
      confirmationToken,
    } = body;

    if (
      !Number.isInteger(cabinNumber) ||
      cabinNumber < 1 ||
      cabinNumber > 8 ||
      !Number.isInteger(numGuests) ||
      numGuests < 1 ||
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      typeof observations !== "string"
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

    if (action === "prepare") {
      // Validate the reservation and obtain a server-calculated quote.
      const proposal = await prepareAIReservation({
        ...bookingDetails,
        observations,
      });

      // Sign the details associated with this proposal.
      const token = createConfirmationToken({
        ...bookingDetails,
        observations,
        guestId: session.user.guestId,
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

    if (
      !verifyConfirmationToken(
        confirmationToken,
        session.user.guestId,
        bookingDetails,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Confirmation is invalid or expired. Please review the booking again.",
        },
        { status: 400 },
      );
    }

    const result = await createAIReservation({
      ...bookingDetails,
      observations,
    });

    return NextResponse.json({
      message: "Reservation created successfully.",
      ...result,
    });
  } catch (error) {
    console.error("AI booking API error:", error);

    return NextResponse.json(
      { error: error.message || "Could not process the reservation." },
      { status: 500 },
    );
  }
}
