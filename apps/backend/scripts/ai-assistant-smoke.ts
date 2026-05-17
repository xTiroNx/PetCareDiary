import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test_webhook_secret_123456789";
process.env.ADMIN_TELEGRAM_IDS = "9999";
process.env.MINIMAX_API_KEY = "test_minimax_key";
process.env.MINIMAX_PARSER_MODEL = "MiniMax-M2.7";
delete process.env.OPENROUTER_API_KEY_AI_HELPER;

const [{ createApp }, { prisma }] = await Promise.all([
  import("../src/app.js"),
  import("../src/prisma/client.js")
]);

const now = new Date();
const activeUser = {
  id: "user-active",
  telegramId: 4001n,
  username: "active_user",
  firstName: "Active",
  lastName: "User",
  languageCode: "en",
  platform: "ios",
  firstStartParam: "direct",
  lastStartParam: "direct",
  source: "direct",
  lastSeenAt: now,
  createdAt: now,
  updatedAt: now,
  trialStartedAt: now,
  trialEndsAt: new Date(now.getTime() + 86_400_000),
  accessUntil: null,
  lifetimeAccess: false
};
const expiredUser = {
  ...activeUser,
  id: "user-expired",
  telegramId: 4002n,
  username: "expired_user",
  trialEndsAt: new Date(now.getTime() - 86_400_000)
};
const paidUser = {
  ...activeUser,
  id: "user-paid",
  telegramId: 4003n,
  username: "paid_user",
  trialEndsAt: new Date(now.getTime() - 86_400_000),
  accessUntil: new Date(now.getTime() + 30 * 86_400_000)
};
const users = new Map([
  [activeUser.telegramId, activeUser],
  [expiredUser.telegramId, expiredUser],
  [paidUser.telegramId, paidUser]
]);

(prisma.user.findUnique as unknown as (args: unknown) => Promise<unknown>) = async (args: unknown) => {
  const where = (args as { where?: { id?: string; telegramId?: bigint } }).where;
  if (where?.telegramId) return users.get(where.telegramId) ?? null;
  if (where?.id === activeUser.id) return activeUser;
  if (where?.id === expiredUser.id) return expiredUser;
  if (where?.id === paidUser.id) return paidUser;
  return null;
};

(prisma.pet.findFirst as unknown as (args: unknown) => Promise<unknown>) = async (args: unknown) => {
  const where = (args as { where?: { id?: string; userId?: string } }).where;
  if (where?.id === "pet-active" && where.userId === activeUser.id) {
    return { id: "pet-active", userId: activeUser.id, name: "Milo", type: "cat", weightKg: null, ageYears: null, healthNotes: null };
  }
  if (where?.id === "pet-paid" && where.userId === paidUser.id) {
    return { id: "pet-paid", userId: paidUser.id, name: "Luna", type: "dog", weightKg: null, ageYears: null, healthNotes: null };
  }
  return null;
};

(prisma.analyticsEvent.count as unknown as () => Promise<number>) = async () => 0;
(prisma.analyticsEvent.create as unknown as () => Promise<unknown>) = async () => ({ id: "analytics-event" });

for (const model of [
  prisma.feedingEntry,
  prisma.symptomEntry,
  prisma.medicineEntry,
  prisma.weightEntry,
  prisma.noteEntry,
  prisma.waterEntry,
  prisma.vaccinationEntry
]) {
  (model.findMany as unknown as () => Promise<unknown[]>) = async () => [];
}

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("api.minimax") || url.includes("openrouter.ai")) {
    return new Response(JSON.stringify({
      choices: [
        { message: { content: "<think>hidden reasoning</think>- Ask the veterinarian about appetite changes." } }
      ]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  return realFetch(input, init);
};

const app = createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});

type JsonResponse = {
  status: number;
  body: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function signedInitData(telegramId: number) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `ai-assistant-smoke-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: "AI", language_code: "en" })
  });
  const dataCheck = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheck).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function baseUrl() {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address.");
  return `http://127.0.0.1:${address.port}`;
}

async function postAssistant(telegramId: number, petId = "pet-active"): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl()}/api/ai/assistant`, {
    method: "POST",
    headers: {
      Authorization: `tma ${signedInitData(telegramId)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      petId,
      mode: "VET_QUESTIONS",
      period: "7",
      timezone: "Europe/Moscow",
      locale: "en"
    })
  });
  return { status: response.status, body: await response.json() };
}

try {
  const active = await postAssistant(Number(activeUser.telegramId));
  assert(active.status === 200, `Expected active non-admin user to access AI assistant, got ${active.status}`);
  assert(typeof active.body === "object" && active.body !== null, "Expected JSON object response for active user.");
  const activeBody = active.body as { answer?: unknown; disclaimer?: unknown; usedPeriod?: unknown };
  assert(typeof activeBody.answer === "string" && activeBody.answer.includes("veterinarian"), "Expected AI answer text.");
  assert(!activeBody.answer.includes("<think>"), "Expected AI answer to be sanitized.");
  assert(typeof activeBody.disclaimer === "string" && activeBody.disclaimer.length > 0, "Expected disclaimer.");
  assert(activeBody.usedPeriod === 7, "Expected usedPeriod to reflect request period.");

  const paid = await postAssistant(Number(paidUser.telegramId), "pet-paid");
  assert(paid.status === 200, `Expected paid non-admin user to access AI assistant, got ${paid.status}`);

  const expired = await postAssistant(Number(expiredUser.telegramId));
  assert(expired.status === 403, `Expected expired user to be rejected, got ${expired.status}`);

  console.log("AI assistant smoke checks passed.");
} finally {
  globalThis.fetch = realFetch;
  server.close();
}
