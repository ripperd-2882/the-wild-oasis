import { GoogleGenAI } from "@google/genai";
import { getCabin } from "../../_lib/data-service";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const cabinMap = {
  1: 1,
  2: 20,
  3: 21,
  4: 23,
  5: 32,
  6: 33,
  7: 34,
  8: 35,
};

const getCabinTool = {
  type: "function",
  name: "get_cabin",
  description:
    "Gets information about one of The Wild Oasis cabins. Use this when the guest asks about a specific cabin.",
  parameters: {
    type: "object",
    properties: {
      cabinNumber: {
        type: "integer",
        description: "The cabin number shown to guests, from 1 to 8.",
      },
    },
    required: ["cabinNumber"],
  },
};

async function getCabinForAI({ cabinNumber }) {
  const databaseId = cabinMap[cabinNumber];

  if (!databaseId) {
    throw new Error("Invalid cabin number");
  }

  return await getCabin(databaseId);
}

const availableFunctions = {
  get_cabin: getCabinForAI,
};

export async function POST(request) {
  try {
    const { message } = await request.json();

    const history = [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text: message,
          },
        ],
      },
    ];

    let interaction;

    while (true) {
      interaction = await ai.interactions.create({
        model: "gemini-3.7-flash",
        store: false,

        input: history,

        tools: [getCabinTool],

        system_instruction: `
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

          When a guest asks about a specific cabin,
          use the get_cabin tool to retrieve the actual
          cabin information before answering.
        `,
      });

      const functionResults = [];

      for (const step of interaction.steps) {
        history.push(step);

        if (step.type === "function_call") {
          const functionToCall = availableFunctions[step.name];

          if (!functionToCall) {
            throw new Error(`Unknown function: ${step.name}`);
          }

          const result = await functionToCall(step.arguments);

          const functionResult = {
            type: "function_result",
            name: step.name,
            call_id: step.id,
            result: [
              {
                type: "text",
                text: JSON.stringify(result),
              },
            ],
          };

          functionResults.push(functionResult);
          history.push(functionResult);
        }
      }

      if (functionResults.length === 0) {
        break;
      }
    }

    return Response.json({
      reply: interaction.output_text,
    });
  } catch (error) {
    console.error("AI API Error:", error);

    return Response.json(
      {
        error: error.message || "Something went wrong while talking to the AI.",
        status: error.status || 500,
      },
      {
        status: error.status || 500,
      },
    );
  }
}
