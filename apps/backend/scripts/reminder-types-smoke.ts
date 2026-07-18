process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";

const [{ reminderListOrderBy, reminderSchema }, { accessNotificationMessage, messageFor, paymentReceiptMessage }] = await Promise.all([
  import("../src/routes/reminders.routes.js"),
  import("../src/services/reminderScheduler.service.js")
]);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const baseReminder = {
  petId: "pet-1",
  title: "Drink water",
  time: "2026-05-16T10:00:00.000Z",
  repeatRule: null
};

const waterReminder = reminderSchema.parse({ ...baseReminder, type: "WATER" });
assert(waterReminder.type === "WATER", "Expected WATER reminder type to be accepted.");

const vaccinationReminder = reminderSchema.parse({ ...baseReminder, type: "VACCINATION" });
assert(vaccinationReminder.type === "VACCINATION", "Expected VACCINATION reminder type to remain accepted.");

const unsupportedType = reminderSchema.safeParse({ ...baseReminder, type: "SYMPTOM" });
assert(!unsupportedType.success, "Expected unsupported reminder type to be rejected.");

assert(reminderListOrderBy[0]?.time === "desc", "Expected newest reminder times first.");
assert(reminderListOrderBy[1]?.createdAt === "desc", "Expected newest created reminder first when times match.");

const englishReminder = messageFor({
  title: "Give medicine",
  type: "MEDICINE",
  user: { telegramId: 1n, languageCode: "en" }
} as Parameters<typeof messageFor>[0]);
assert(englishReminder.includes("Type: Medicine"), "Expected English reminder copy.");
assert(!englishReminder.includes("Тип:"), "Expected reminder copy not to fall back to Russian.");

const localizedChecks = [
  ["ru", "Пробный Pro"],
  ["en", "Pro trial"],
  ["es", "prueba Pro"],
  ["fr", "essai Pro"],
  ["de", "Pro-Test"],
  ["zh", "Pro 试用"]
] as const;
for (const [languageCode, expected] of localizedChecks) {
  assert(accessNotificationMessage("TRIAL_ENDING_SOON", new Date("2026-07-20T00:00:00.000Z"), languageCode).includes(expected), `Expected localized access notification for ${languageCode}.`);
}
assert(paymentReceiptMessage("MONTH", 99, "en").includes("Payment completed successfully"), "Expected English payment receipt.");

console.log("Reminder type smoke checks passed.");
