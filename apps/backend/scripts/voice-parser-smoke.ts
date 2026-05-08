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

async function parse(transcript: string, locale: "ru" | "en" | "es" | "fr" | "de" | "zh" = "ru") {
  return parseVoiceCommandWithMinimax({
    transcript,
    clientNow: "2026-05-07T12:00:00.000Z",
    timezone: "Europe/Moscow",
    locale
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
assert(medicine.target === "diary", "Expected diary target.");
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
assert(reminder.target === "reminder", "Expected reminder target.");
assert(reminder.draft.type === "FEEDING", "Expected feeding reminder type.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: {
    dateTime: "2026-05-07T12:00:00.000Z",
    note: "покормил влажным кормом утром"
  },
  warnings: []
}));
const feeding = await parse("покормил влажным кормом утром");
assert(feeding.intent === "create_feeding_entry", "Expected rule-corrected feeding intent.");
assert(feeding.target === "diary", "Expected feeding diary target.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: {
    dateTime: "2026-05-07T12:00:00.000Z",
    note: "рвота утром два раза"
  },
  warnings: []
}));
const symptom = await parse("рвота утром два раза");
assert(symptom.intent === "create_symptom_entry", "Expected rule-corrected symptom intent.");

mockMiniMax(JSON.stringify({
  intent: "unknown",
  target: "unknown",
  confidence: 0.3,
  draft: {},
  warnings: []
}));
const englishReminder = await parse("remind me to feed at 5", "en");
assert(englishReminder.intent === "create_reminder", "Expected English reminder intent.");
assert(englishReminder.target === "reminder", "Expected English reminder target.");
assert(englishReminder.draft.type === "FEEDING", "Expected English feeding reminder type.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: { dateTime: "2026-05-07T12:00:00.000Z", note: "comió comida húmeda por la mañana" },
  warnings: []
}));
const spanishFeeding = await parse("comió comida húmeda por la mañana", "es");
assert(spanishFeeding.intent === "create_feeding_entry", "Expected Spanish feeding intent.");
assert(spanishFeeding.draft.foodType === "WET", "Expected Spanish wet food inference.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: { dateTime: "2026-05-07T12:00:00.000Z", note: "vomissements deux fois ce matin" },
  warnings: []
}));
const frenchSymptom = await parse("vomissements deux fois ce matin", "fr");
assert(frenchSymptom.intent === "create_symptom_entry", "Expected French symptom intent.");
assert(frenchSymptom.draft.symptomType === "VOMITING", "Expected French vomiting inference.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: { dateTime: "2026-05-07T12:00:00.000Z", note: "Gewicht 4,2 kg" },
  warnings: []
}));
const germanWeight = await parse("Gewicht 4,2 kg", "de");
assert(germanWeight.intent === "create_weight_entry", "Expected German weight intent.");
assert(germanWeight.draft.weightKg.toString() === "4.2", "Expected German weight value inference.");

mockMiniMax(JSON.stringify({
  intent: "unknown",
  target: "unknown",
  confidence: 0.3,
  draft: {},
  warnings: []
}));
const chineseNote = await parse("记录备注 早上没胃口", "zh");
assert(chineseNote.intent === "create_note", "Expected Chinese explicit note to stay note.");
assert(chineseNote.draft.note === "记录备注 早上没胃口", "Expected Chinese note fallback from transcript.");

mockMiniMax(JSON.stringify({
  intent: "unknown",
  target: "unknown",
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
