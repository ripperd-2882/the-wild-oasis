"use client";

import { useState } from "react";
import Link from "next/link";

export default function AIConcierge() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <section className="max-w-2xl mx-auto border border-primary-700 rounded-lg p-6">
      <h2 className="text-2xl font-semibold mb-4">AI Concierge</h2>

      <div className="space-y-4 mb-6">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={msg.role === "user" ? "text-right" : "text-left"}
          >
            <div className="inline-block max-w-full p-3 rounded-lg bg-primary-900">
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>

            {msg.reservationProposal && (
              <div className="mt-3 border border-accent-500 rounded-lg p-4 text-left">
                <h3 className="font-semibold text-lg mb-3">
                  Reservation Proposal
                </h3>

                <p>Cabin: {msg.reservationProposal.cabinNumber}</p>
                <p>Check-in: {msg.reservationProposal.startDate}</p>
                <p>Check-out: {msg.reservationProposal.endDate}</p>
                <p>Guests: {msg.reservationProposal.numGuests}</p>
                <p>Nights: {msg.reservationProposal.numNights}</p>
                <p>Price per night: ${msg.reservationProposal.nightlyPrice}</p>
                <p className="font-semibold mt-2">
                  Total: ${msg.reservationProposal.totalPrice}
                </p>

                <Link
                  href="/login"
                  className="inline-block mt-4 bg-accent-500 text-primary-900 px-4 py-2 rounded"
                >
                  Sign in to continue
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>

      {loading && <p>AI is thinking...</p>}

      {error && <p className="text-red-400 mb-3">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask me anything..."
          className="flex-1 p-3 rounded bg-primary-900 text-primary-100"
          disabled={loading}
        />

        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="bg-accent-500 text-primary-900 px-5 rounded disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
