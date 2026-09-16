import { GoogleGenAI } from "@google/genai";

import {
  checkCabinAvailability,
  getCabinByNumber,
  getCabins,
} from "../../_lib/data-service";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    timeout: 15000,
    retryOptions: {
      attempts: 1,
    },
  },
});

const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.7-flash";

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

const tools = [getCabinTool, getCabinsTool, checkAvailabilityTool];

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date format");
  }

  if (start < today) {
    throw new Error("The check-in date cannot be in the past");
  }

  if (end <= start) {
    throw new Error("The check-out date must be after the check-in date");
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

function isRetryableAIError(error) {
  return (
    error?.status === 429 ||
    error?.status === 503 ||
    error?.name === "TimeoutError"
  );
}

async function createInteraction(model, input, previousInteractionId) {
  return await ai.interactions.create({
    model,
    input,
    previous_interaction_id: previousInteractionId,
    tools,
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

      When a guest asks whether a cabin is available
      for specific dates, always use the
      check_availability tool.

      Never guess or assume availability.

      Only say that a cabin is available or unavailable
      based on the result returned by the tool.

      Today's date is ${today}.

      When interpreting dates:
      - Treat today's date as the reference date.
      - Never assume a year that is already in the past.
      - If the guest gives a month and day without a year
        and the intended year is ambiguous, ask the guest
        which year they mean.
      - If the guest explicitly says "this year", use the
        current year.
      - If the guest says "next year", use the following year.
    `,
  });
}

async function createAIInteraction(history) {
  try {
    console.log(`Trying primary model: ${PRIMARY_MODEL}`);

    return await createInteraction(PRIMARY_MODEL, history);
  } catch (error) {
    if (!isRetryableAIError(error)) {
      throw error;
    }

    console.warn(
      `Primary model failed with ${error.status}. Trying fallback model: ${FALLBACK_MODEL}`,
    );

    return await createInteraction(FALLBACK_MODEL, history);
  }
}

export async function POST(request) {
  try {
    const { message, conversationId } = await request.json();

    console.log("Conversation ID:", conversationId);
    console.log("Message:", message);

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
      interaction = await createAIInteraction(history);

      const functionResults = [];

      for (const step of interaction.steps) {
        history.push(step);

        if (step.type === "function_call") {
          const functionToCall = availableFunctions[step.name];

          if (!functionToCall) {
            throw new Error(`Unknown function: ${step.name}`);
          }

          let result;

          try {
            const data = await functionToCall(step.arguments);

            result = {
              success: true,
              data,
            };
          } catch (error) {
            result = {
              success: false,
              error:
                error.message || "The tool could not complete the request.",
            };
          }

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
