process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.MINIMAX_API_KEY = "test_minimax_key";
process.env.MINIMAX_PARSER_MODEL = "MiniMax-M2.7";
process.env.MINIMAX_REPORT_MODEL = "MiniMax-M2.7";

const { renderReportPdf } = await import("../src/routes/reports.routes.js");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const report = {
  period: 90,
  from: new Date("2026-02-10T00:00:00.000Z"),
  pet: {
    id: "pet-1",
    name: "Milo",
    type: "CAT",
    weightKg: { toString: () => "4.2" },
    ageYears: 3,
    healthNotes: "Sensitive stomach"
  },
  petName: "Milo",
  counts: {
    feeding: 1,
    symptoms: 1,
    medicines: 2,
    medicinesTaken: 1,
    weights: 2,
    notes: 1,
    water: 2,
    vaccinations: 1,
    reminders: 1
  },
  entries: {
    feeding: [{ id: "feeding-1", dateTime: new Date("2026-05-11T10:00:00.000Z"), foodType: "WET", amount: "1 pouch", note: "ate slowly" }],
    symptoms: [{ id: "symptom-1", dateTime: new Date("2026-05-11T12:00:00.000Z"), symptomType: "NO_APPETITE", severity: 2, note: "low appetite" }],
    medicines: [
      { id: "medicine-1", dateTime: new Date("2026-05-11T13:00:00.000Z"), medicineName: "antepsin", dosage: "", taken: true, note: null },
      { id: "medicine-2", dateTime: new Date("2026-05-11T14:00:00.000Z"), medicineName: "omeprazole", dosage: "", taken: false, note: "skipped" }
    ],
    weights: [
      { id: "weight-1", date: new Date("2026-05-05T09:00:00.000Z"), weightKg: { toString: () => "4.1" } },
      { id: "weight-2", date: new Date("2026-05-11T09:00:00.000Z"), weightKg: { toString: () => "4.2" } }
    ],
    notes: [{ id: "note-1", dateTime: new Date("2026-05-11T15:00:00.000Z"), note: "played after dinner" }],
    water: [
      { id: "water-1", dateTime: new Date("2026-05-11T08:00:00.000Z"), amountMl: 120, note: "morning bowl" },
      { id: "water-2", dateTime: new Date("2026-05-11T20:00:00.000Z"), amountMl: 90, note: null }
    ],
    vaccinations: [
      {
        id: "vaccination-1",
        date: new Date("2026-04-01T09:00:00.000Z"),
        procedureType: "VACCINE",
        title: "Rabies",
        nextDueDate: new Date("2027-04-01T09:00:00.000Z"),
        note: "clinic record"
      }
    ],
    reminders: [
      {
        id: "reminder-1",
        type: "VACCINATION",
        title: "Rabies booster",
        time: new Date("2027-04-01T09:00:00.000Z"),
        repeatRule: null,
        active: true
      }
    ]
  }
};

const locales = [
  ["ru", "ru-RU"],
  ["en", "en-US"],
  ["es", "es-ES"],
  ["fr", "fr-FR"],
  ["de", "de-DE"],
  ["zh", "zh-CN"]
] as const;

globalThis.fetch = async () => new Response(JSON.stringify({
  choices: [{ message: { content: "Discuss repeated appetite changes with a veterinarian." } }]
}), { status: 200, headers: { "Content-Type": "application/json" } });

for (const [language, locale] of locales) {
  const pdf = await renderReportPdf(report as never, { language, locale, timezone: "Europe/Moscow" });
  assert(pdf.subarray(0, 4).toString() === "%PDF", `Expected ${language} PDF buffer.`);
}

globalThis.fetch = async () => {
  throw new Error("MiniMax unavailable");
};

const fallbackPdf = await renderReportPdf(report as never, { language: "en", locale: "en-US", timezone: "Asia/Shanghai" });
assert(fallbackPdf.subarray(0, 4).toString() === "%PDF", "Expected PDF buffer when MiniMax fails.");

console.log("Report PDF smoke checks passed.");
