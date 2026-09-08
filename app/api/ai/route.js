import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(request) {
  try {
    const { message } = await request.json();

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",

      config: {
        systemInstruction: `
      You are the AI Concierge for The Wild Oasis,
a luxury cabin hotel in the Italian Dolomites.

Your role is to assist guests with questions
about the hotel and their stay.

You can help with:
- cabins
- amenities
- reservations
- hotel policies
- activities
- general guest questions

Communication rules:
- Be friendly and welcoming.
- Keep answers concise.
- Use simple language.
- Ask follow-up questions when necessary.
- Never invent hotel information.
- If information is unavailable, say so clearly.
- Do not claim that a cabin is available unless
  availability has been verified by the application.
    `,
      },

      contents: message,
    });

    return Response.json({
      reply: response.text,
    });
  } catch (error) {
    console.error("AI API Error:", error);

    return Response.json(
      {
        error: error.message || "Something went wrong while talking to the AI.",
        status: error.status || 500,
      },
      { status: error.status || 500 },
    );
  }
}
