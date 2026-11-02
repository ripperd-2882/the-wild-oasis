"use client";

import { useState } from "react";

export default function AIConcierge() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bookingStatus, setBookingStatus] = useState({});
  const [preparedBookings, setPreparedBookings] = useState({});
  const [bookingErrors, setBookingErrors] = useState({});

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
                    {msg.text}
                  </div>

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
