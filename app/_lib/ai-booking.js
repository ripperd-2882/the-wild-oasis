import "server-only";

import { auth } from "./auth";
import { supabase } from "./supabase";
import { getCabinByNumber } from "./data-service";

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export async function createAIReservation({
  cabinNumber,
  startDate,
  endDate,
  numGuests,
  observations = "",
}) {
  // 1. Identify the authenticated guest on the server.
  const session = await auth();

  if (!session?.user?.guestId) {
    throw new Error("Please sign in before making a reservation.");
  }

  // 2. Validate the request.
  if (!Number.isInteger(cabinNumber) || cabinNumber < 1 || cabinNumber > 8) {
    throw new Error("Please select a valid cabin number.");
  }

  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    throw new Error("Please provide valid dates in YYYY-MM-DD format.");
  }

  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (startDate < todayString) {
    throw new Error("Check-in cannot be in the past.");
  }

  if (endDate <= startDate) {
    throw new Error("Check-out must be after check-in.");
  }

  if (!Number.isInteger(numGuests) || numGuests < 1) {
    throw new Error("Please provide a valid number of guests.");
  }

  if (typeof observations !== "string") {
    throw new Error("Invalid observations.");
  }

  // 3. Get authoritative cabin details from Supabase.
  const cabin = await getCabinByNumber(cabinNumber);

  if (numGuests > cabin.maxCapacity) {
    throw new Error(
      `Cabin ${cabinNumber} can accommodate at most ${cabin.maxCapacity} guests.`,
    );
  }

  // 4. Check existing bookings on the server.
  // Keep the existing project's booking filter consistent.
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("startDate, endDate")
    .eq("cabinId", cabin.id)
    .or(
      "startDate.gte." +
        new Date().toISOString().slice(0, 10) +
        ",status.eq.checked-in",
    );

  if (bookingsError) {
    console.error("AI reservation availability check failed:", bookingsError);
    throw new Error("Could not verify cabin availability. Please try again.");
  }

  // A guest checks out on the day the next guest may check in.
  const hasConflict = bookings.some((booking) => {
    return startDate < booking.endDate && endDate > booking.startDate;
  });

  if (hasConflict) {
    throw new Error(
      "This cabin is no longer available for those dates. Please choose different dates.",
    );
  }

  // 5. Calculate the price from trusted database values.
  const nights =
    (Date.parse(`${endDate}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
    (24 * 60 * 60 * 1000);

  const nightlyPrice = cabin.regularPrice - cabin.discount;

  if (!Number.isFinite(nightlyPrice) || nightlyPrice < 0) {
    throw new Error("Could not calculate the cabin price.");
  }

  const totalPrice = nights * nightlyPrice;

  // 6. Create the reservation for the authenticated guest.
  const newBooking = {
    cabinId: cabin.id,
    guestId: session.user.guestId,
    startDate,
    endDate,
    numNights: nights,
    numGuests,
    cabinPrice: totalPrice,
    extrasPrice: 0,
    totalPrice,
    observations: observations.slice(0, 1000),
    isPaid: false,
    hasBreakfast: false,
    status: "unconfirmed",
  };

  const { data, error } = await supabase
    .from("bookings")
    .insert([newBooking])
    .select(
      "id, cabinId, startDate, endDate, numNights, numGuests, totalPrice, status",
    )
    .single();

  if (error) {
    console.error("AI reservation creation failed:", error);
    throw new Error("The reservation could not be created. Please try again.");
  }

  return {
    booking: data,
    cabinNumber,
  };
}
