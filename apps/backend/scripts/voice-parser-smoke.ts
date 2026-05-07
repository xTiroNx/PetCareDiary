process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.MINIMAX_API_KEY = "test_minimax_key";
process.env.MINIMAX_PARSER_MODEL = "MiniMax-M2.7";

const { parseVoiceCommandWithMinimax } = await import("../src/services/minimaxVoiceCommandParser.service.js");
const { HttpError } = await import("../src/utils/httpError.js");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function mockMiniMax(content: string) {
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content } }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function parse(transcript: string) {
  return parseVoiceCommandWithMinimax({
    transcript,
    clientNow: "2026-05-07T12:00:00.000Z",
    timezone: "Europe/Moscow",
    locale: "ru"
  });
}

mockMiniMax(JSON.stringify({
  intent: "create_medicine_entry",
  confidence: 0.91,
  draft: {
    medicineName: "антепсин",
    dosage: "",
    taken: true,
    dateTime: "2026-05-07T12:00:00.000Z",
    note: null
  },
  warnings: ["dosage_not_provided"]
}));
const medicine = await parse("дал лекарство антепсин");
assert(medicine.intent === "create_medicine_entry", "Expected medicine intent.");
assert(medicine.draft.medicineName === "антепсин", "Expected medicine name in draft.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.86,
  draft: {
    type: "FEEDING",
    title: "Покормить",
    time: "2026-05-07T14:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const reminder = await parse("напомни покормить в 5");
assert(reminder.intent === "create_reminder", "Expected reminder intent.");
assert(reminder.draft.type === "FEEDING", "Expected feeding reminder type.");

mockMiniMax(JSON.stringify({
  intent: "unknown",
  confidence: 0.2,
  draft: {},
  warnings: ["ambiguous_command"]
}));
const unknown = await parse("что-то странное");
assert(unknown.intent === "unknown", "Expected unknown intent.");

mockMiniMax(JSON.stringify({
  intent: "create_medicine_entry",
  confidence: "91%",
  draft: {
    name: "антепсин",
    taken: true
  },
  warnings: []
}));
const normalizedMedicine = await parse("дал лекарство антепсин");
assert(normalizedMedicine.intent === "create_medicine_entry", "Expected normalized medicine intent.");
assert(normalizedMedicine.draft.medicineName === "антепсин", "Expected normalized medicine name.");
assert(normalizedMedicine.draft.dosage === "", "Expected missing dosage to stay empty.");

mockMiniMax("not json");
try {
  await parse("сломай json");
  throw new Error("Expected invalid JSON to fail.");
} catch (error) {
  assert(error instanceof HttpError && error.code === "VOICE_PARSE_FAILED", "Expected VOICE_PARSE_FAILED.");
}

console.log("Voice parser smoke checks passed.");
