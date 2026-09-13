import { GoogleGenAI } from "@google/genai";
import {
  checkCabinAvailability,
  getCabinByNumber,
  getCabins,
} from "../../_lib/data-service";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

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

const getCabinsTool = {
  type: "function",
  name: "get_cabins",
  description:
    "Gets information about all cabins at The Wild Oasis. Use this when the guest asks about available cabins, cabin options, prices, capacities, or wants to compare cabins.",
  parameters: {
    type: "object",
    properties: {},
  },
};

const checkAvailabilityTool = {
  type: "function",
  name: "check_availability",
  description:
    "Checks whether a specific cabin is available for a guest's requested date range. Use this whenever the guest asks whether a cabin is available or can be booked for specific dates.",
  parameters: {
    type: "object",
    properties: {
      cabinNumber: {
        type: "integer",
        description: "The cabin number shown to guests, from 1 to 8.",
      },
      startDate: {
        type: "string",
        description: "The requested check-in date in YYYY-MM-DD format.",
      },
      endDate: {
        type: "string",
        description: "The requested check-out date in YYYY-MM-DD format.",
      },
    },
    required: ["cabinNumber", "startDate", "endDate"],
  },
};

async function getCabinForAI({ cabinNumber }) {
  if (cabinNumber < 1 || cabinNumber > 8) {
    throw new Error("Invalid cabin number");
  }
  return await getCabinByNumber(cabinNumber);
}

async function getCabinsForAI() {
  return await getCabins();
}

async function checkAvailabilityForAI({ cabinNumber, startDate, endDate }) {
  if (cabinNumber < 1 || cabinNumber > 8) {
    throw new Error("Invalid cabin number");
  }

  if (!startDate || !endDate) {
    throw new Error("Start date and end date are required");
  }

  const cabin = await getCabinByNumber(cabinNumber);

  const available = await checkCabinAvailability(cabin.id, startDate, endDate);

  return {
    cabinNumber,
    cabinName: cabin.name,
    startDate,
    endDate,
    available,
  };
}

const availableFunctions = {
  get_cabin: getCabinForAI,
  get_cabins: getCabinsForAI,
  check_availability: checkAvailabilityForAI,
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

        tools: [getCabinTool, getCabinsTool],

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

          When a guest asks about cabins in general,
          or wants to compare cabins, prices, capacity,
          or other cabin information, use the get_cabins
          tool to retrieve the actual cabin data before
          answering.
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
