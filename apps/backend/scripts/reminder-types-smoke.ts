process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";

const { reminderSchema } = await import("../src/routes/reminders.routes.js");

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

console.log("Reminder type smoke checks passed.");
