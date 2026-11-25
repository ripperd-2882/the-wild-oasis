"use client";

import ReactMarkdown from "react-markdown";
import { useState } from "react";

function formatDate(dateString) {
  if (!dateString) return "—";

  // Avoid timezone-related date shifts for YYYY-MM-DD values.
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPrice(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount));
}

export default function AIConcierge({ initialOpen = false }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bookingStatus, setBookingStatus] = useState({});
  const [preparedBookings, setPreparedBookings] = useState({});
  const [bookingErrors, setBookingErrors] = useState({});
  const [bookingResults, setBookingResults] = useState({});

  async function handleSubmit(e) {
    e.preventDefault();

    const userMessage = message.trim();

    if (!userMessage || loading) return;

    setMessage("");
    setError("");
    setLoading(true);

    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          reservationProposal: data.reservationProposal,
          availableCabins: data.availableCabins || [],
        },
      ]);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePrepareBooking(proposal, index) {
    setBookingStatus((prev) => ({
      ...prev,
      [index]: "loading",
    }));

    setBookingErrors((prev) => ({
      ...prev,
      [index]: "",
    }));

    try {
      const response = await fetch("/api/ai/ai-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "prepare",
          cabinNumber: proposal.cabinNumber,
          startDate: proposal.startDate,
          endDate: proposal.endDate,
          numGuests: proposal.numGuests,
          observations: proposal.observations || "",
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        setBookingStatus((prev) => ({
          ...prev,
          [index]: "authentication_required",
        }));

        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Could not prepare reservation.");
      }

      setPreparedBookings((prev) => ({
        ...prev,
        [index]: {
          confirmationToken: data.confirmationToken,
          booking: data.booking,
          expiresInSeconds: data.expiresInSeconds,
          preparedAt: Date.now(),
        },
      }));

      setBookingStatus((prev) => ({
        ...prev,
        [index]: "prepared",
      }));
    } catch (error) {
      setBookingErrors((prev) => ({
        ...prev,
        [index]: error.message,
      }));

      setBookingStatus((prev) => ({
        ...prev,
        [index]: "error",
      }));
    }
  }

  async function handleConfirmBooking(proposal, index) {
    const prepared = preparedBookings[index];

    if (!prepared?.confirmationToken) {
      setBookingErrors((prev) => ({
        ...prev,
        [index]: "Please prepare the reservation again.",
      }));
      return;
    }

    // Check the five-minute token expiry on the frontend.
    const elapsedSeconds = (Date.now() - prepared.preparedAt) / 1000;

    if (elapsedSeconds >= prepared.expiresInSeconds) {
      setBookingStatus((prev) => ({
        ...prev,
        [index]: "error",
      }));

      setPreparedBookings((prev) => ({
        ...prev,
        [index]: null,
      }));

      setBookingErrors((prev) => ({
        ...prev,
        [index]: "Your confirmation has expired. Please prepare again.",
      }));

      return;
    }

    setBookingStatus((prev) => ({
      ...prev,
      [index]: "confirming",
    }));

    setBookingErrors((prev) => ({
      ...prev,
      [index]: "",
    }));

    try {
      const response = await fetch("/api/ai/ai-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "confirm",
          cabinNumber: proposal.cabinNumber,
          startDate: proposal.startDate,
          endDate: proposal.endDate,
          numGuests: proposal.numGuests,
          observations: proposal.observations || "",
          confirmationToken: prepared.confirmationToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not confirm reservation.");
      }

      setBookingResults((prev) => ({
        ...prev,
        [index]: data,
      }));

      setBookingStatus((prev) => ({
        ...prev,
        [index]: "confirmed",
      }));
    } catch (error) {
      setBookingErrors((prev) => ({
        ...prev,
        [index]: error.message,
      }));

      setBookingStatus((prev) => ({
        ...prev,
        [index]: "error",
      }));
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Expanded chatbot window */}
      {isOpen && (
        <section className="w-[calc(100vw-2rem)] sm:w-[380px] h-[min(600px,calc(100vh-120px))] bg-primary-950 border border-primary-700 rounded-xl shadow-2xl flex flex-col overflow-hidden mb-4">
          {/* Chat header */}
          <div className="bg-primary-800 px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-primary-100">
                AI Concierge
              </h2>
              <p className="text-xs text-primary-300">
                Here to help with your stay
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Minimize AI Concierge"
              className="text-primary-100 text-2xl hover:text-accent-400"
            >
              −
            </button>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="bg-primary-900 rounded-lg p-4 text-sm">
                Hello! Welcome to The Wild Oasis.
                <br />
                <br />
                I&apos;m your AI Concierge. Ask me about our cabins,
                availability, or reservations.
              </div>
            )}

            {messages.map((msg, index) => (
              <div
                key={index}
                className={
                  msg.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div className="max-w-[90%]">
                  <div
                    className={
                      msg.role === "user"
                        ? "bg-accent-500 text-primary-950 rounded-xl rounded-br-sm p-3 text-sm whitespace-pre-wrap"
                        : "bg-primary-800 text-primary-100 rounded-xl rounded-bl-sm p-3 text-sm whitespace-pre-wrap"
                    }
                  >
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-3 last:mb-0 leading-relaxed">
                            {children}
                          </p>
                        ),

                        ul: ({ children }) => (
                          <ul className="list-disc pl-5 mb-3 space-y-2">
                            {children}
                          </ul>
                        ),

                        ol: ({ children }) => (
                          <ol className="list-decimal pl-5 mb-3 space-y-2">
                            {children}
                          </ol>
                        ),

                        li: ({ children }) => (
                          <li className="pl-1">{children}</li>
                        ),

                        strong: ({ children }) => (
                          <strong className="font-bold text-accent-400">
                            {children}
                          </strong>
                        ),

                        h3: ({ children }) => (
                          <h3 className="font-semibold text-base mb-2">
                            {children}
                          </h3>
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>

                  {msg.availableCabins?.length > 0 && (
                    <div className="mt-3 space-y-3">
                      <h3 className="text-sm font-semibold text-primary-100">
                        Available cabins
                      </h3>

                      {msg.availableCabins.map((cabin) => (
                        <div
                          key={cabin.cabinNumber}
                          className="bg-primary-900 border border-primary-700 rounded-lg p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-semibold text-primary-100">
                              {cabin.cabinName || `Cabin ${cabin.cabinNumber}`}
                            </h4>

                            <span className="text-xs bg-green-900/40 text-green-400 px-2 py-1 rounded-full">
                              Available
                            </span>
                          </div>

                          <p className="text-xs text-primary-300">
                            Cabin number: {cabin.cabinNumber}
                          </p>

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-primary-300">
                              Maximum capacity
                            </span>
                            <span className="text-primary-100">
                              {cabin.maxCapacity != null
                                ? `${cabin.maxCapacity} guests`
                                : "Not available"}
                            </span>
                          </div>

                          {cabin.nightlyPrice != null && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-primary-300">
                                Price per night
                              </span>
                              <span className="font-semibold text-accent-400">
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                }).format(cabin.nightlyPrice)}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.reservationProposal && (
                    <div className="mt-2 border border-accent-500 rounded-lg p-3 text-sm">
                      <h3 className="font-semibold mb-2">
                        Reservation Proposal
                      </h3>

                      <p>Cabin: {msg.reservationProposal.cabinNumber}</p>
                      <p>Check-in: {msg.reservationProposal.startDate}</p>
                      <p>Check-out: {msg.reservationProposal.endDate}</p>
                      <p>Guests: {msg.reservationProposal.numGuests}</p>
                      <p>Nights: {msg.reservationProposal.numNights}</p>
                      <p>
                        Price per night: ${msg.reservationProposal.nightlyPrice}
                      </p>

                      <p className="font-semibold mt-2">
                        Total: ${msg.reservationProposal.totalPrice}
                      </p>

                      {bookingStatus[index] === "confirmed" ? (
                        <div className="mt-4 bg-green-900/30 border border-green-500 rounded-lg p-4 space-y-3">
                          {(() => {
                            const result = bookingResults[index];
                            const booking = result?.booking;

                            if (!booking) {
                              return (
                                <p className="text-red-400">
                                  Booking was created, but booking details could
                                  not be displayed.
                                </p>
                              );
                            }

                            return (
                              <>
                                {/* Success heading */}
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-green-400 font-semibold text-base">
                                    Booking created!
                                  </p>

                                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
                                    {booking.status || "Unknown"}
                                  </span>
                                </div>

                                <p className="text-xs text-primary-300">
                                  {result.message}
                                </p>

                                {/* Booking ID */}
                                <div className="border-b border-primary-700 pb-3">
                                  <p className="text-xs text-primary-300">
                                    Booking ID
                                  </p>
                                  <p className="font-semibold break-all">
                                    {booking.id ?? "—"}
                                  </p>
                                </div>

                                {/* Cabin details */}
                                <div>
                                  <p className="text-xs text-primary-300">
                                    Cabin
                                  </p>
                                  <p className="font-semibold">
                                    {msg.reservationProposal.cabinName ||
                                      `Cabin ${result.cabinNumber ?? booking.cabinId ?? ""}`}
                                  </p>
                                  <p className="text-sm text-primary-300">
                                    Cabin number: {result.cabinNumber ?? "—"}
                                  </p>
                                </div>

                                {/* Stay details */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-xs text-primary-300">
                                      Check-in
                                    </p>
                                    <p className="font-medium">
                                      {formatDate(booking.startDate)}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-xs text-primary-300">
                                      Check-out
                                    </p>
                                    <p className="font-medium">
                                      {formatDate(booking.endDate)}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-xs text-primary-300">
                                      Guests
                                    </p>
                                    <p className="font-medium">
                                      {booking.numGuests ?? "—"}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-xs text-primary-300">
                                      Nights
                                    </p>
                                    <p className="font-medium">
                                      {booking.numNights ?? "—"}
                                    </p>
                                  </div>
                                </div>

                                {/* Total price */}
                                <div className="border-t border-primary-700 pt-3 flex justify-between items-center">
                                  <p className="font-semibold">Total price</p>
                                  <p className="text-lg font-bold text-accent-400">
                                    {formatPrice(booking.totalPrice)}
                                  </p>
                                </div>

                                <p className="text-xs text-primary-300">
                                  Your booking has been created successfully.
                                  Its current status is{" "}
                                  {booking.status || "unknown"}.
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      ) : bookingStatus[index] === "prepared" ||
                        bookingStatus[index] === "confirming" ? (
                        <div className="mt-4 space-y-3">
                          <p className="text-green-400 text-sm font-semibold">
                            Booking details verified!
                          </p>

                          <button
                            type="button"
                            onClick={() =>
                              handleConfirmBooking(
                                msg.reservationProposal,
                                index,
                              )
                            }
                            disabled={bookingStatus[index] === "confirming"}
                            className="w-full bg-accent-500 text-primary-950 px-4 py-3 rounded-lg font-semibold disabled:opacity-50"
                          >
                            {bookingStatus[index] === "confirming"
                              ? "Confirming reservation..."
                              : "Confirm reservation"}
                          </button>

                          <p className="text-xs text-primary-300">
                            Clicking Confirm reservation will create your
                            booking.
                          </p>
                        </div>
                      ) : null}

                      {bookingStatus[index] === "prepared" ? (
                        <div className="mt-4 space-y-2">
                          <p className="text-green-400 font-semibold">
                            Booking details verified!
                          </p>

                          <p className="text-xs text-primary-300">
                            Your confirmation token is ready. No reservation has
                            been created yet.
                          </p>
                        </div>
                      ) : bookingStatus[index] === "authentication_required" ? (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm text-yellow-400">
                            Please sign in with Google before proceeding.
                          </p>

                          <a
                            href="/login"
                            className="inline-block bg-accent-500 text-primary-950 px-4 py-2 rounded-lg font-semibold"
                          >
                            Sign in to continue
                          </a>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handlePrepareBooking(msg.reservationProposal, index)
                          }
                          disabled={bookingStatus[index] === "loading"}
                          className="mt-4 w-full bg-accent-500 text-primary-950 px-4 py-3 rounded-lg font-semibold disabled:opacity-50"
                        >
                          {bookingStatus[index] === "loading"
                            ? "Verifying reservation..."
                            : bookingStatus[index] === "error"
                              ? "Try again"
                              : "Continue to booking"}
                        </button>
                      )}

                      {bookingErrors[index] && (
                        <p className="text-sm text-red-400 mt-2">
                          {bookingErrors[index]}
                        </p>
                      )}

                      <p className="text-xs text-primary-300 mt-2">
                        This is a proposal, not a confirmed reservation.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <p className="text-sm text-primary-300">
                AI Concierge is thinking...
              </p>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          {/* Message input */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-primary-700 p-3 flex gap-2"
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask me anything..."
              disabled={loading}
              className="min-w-0 flex-1 bg-primary-900 text-primary-100 rounded-lg px-3 py-3 text-sm outline-none focus:ring-1 focus:ring-accent-500"
            />

            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="bg-accent-500 text-primary-950 font-semibold px-4 rounded-lg disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>
      )}

      {/* Floating chatbot button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Close AI Concierge" : "Open AI Concierge"}
          aria-expanded={isOpen}
          className="h-16 w-16 rounded-full bg-accent-500 text-primary-950 shadow-xl hover:bg-accent-400 transition-all flex items-center justify-center text-3xl"
        >
          {isOpen ? "×" : "✦"}
        </button>
      </div>
    </div>
  );
}
