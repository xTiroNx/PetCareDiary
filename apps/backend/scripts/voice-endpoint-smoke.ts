import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test_webhook_secret_123456789";
process.env.VOICE_COMMANDS_ENABLED = "true";
process.env.OPENROUTER_API_KEY = "test_openrouter_key";
process.env.MINIMAX_API_KEY = "test_minimax_key";
process.env.ADMIN_TELEGRAM_IDS = "1003";

const [{ createApp }, { prisma }] = await Promise.all([
  import("../src/app.js"),
  import("../src/prisma/client.js")
]);

const now = new Date();
const users = new Map([
  [1001n, {
    id: "user-active",
    telegramId: 1001n,
    username: "active_user",
    firstName: "Active",
    lastName: "User",
    languageCode: "en",
    createdAt: now,
    updatedAt: now,
    trialStartedAt: now,
    trialEndsAt: new Date(now.getTime() + 60_000),
    accessUntil: null,
    lifetimeAccess: false
  }],
  [1002n, {
    id: "user-expired",
    telegramId: 1002n,
    username: "expired_user",
    firstName: "Expired",
    lastName: "User",
    languageCode: "en",
    createdAt: now,
    updatedAt: now,
    trialStartedAt: new Date(now.getTime() - 2 * 86_400_000),
    trialEndsAt: new Date(now.getTime() - 86_400_000),
    accessUntil: null,
    lifetimeAccess: false
  }],
  [1003n, {
    id: "user-admin",
    telegramId: 1003n,
    username: "admin_user",
    firstName: "Admin",
    lastName: "User",
    languageCode: "en",
    createdAt: now,
    updatedAt: now,
    trialStartedAt: new Date(now.getTime() - 2 * 86_400_000),
    trialEndsAt: new Date(now.getTime() - 86_400_000),
    accessUntil: null,
    lifetimeAccess: false
  }]
]);
const realFetch = globalThis.fetch.bind(globalThis);

(prisma.user.findUnique as unknown as (args: unknown) => Promise<unknown>) = async (args: unknown) => {
  const telegramId = (args as { where?: { telegramId?: bigint } }).where?.telegramId;
  return telegramId ? users.get(telegramId) ?? null : null;
};

(prisma.pet.findFirst as unknown as (args: unknown) => Promise<unknown>) = async (args: unknown) => {
  const where = (args as { where?: { id?: string; userId?: string } }).where;
  if (where?.id === "pet-owned" && where.userId === "user-active") return { id: "pet-owned", userId: "user-active" };
  if (where?.id === "pet-expired" && where.userId === "user-expired") return { id: "pet-expired", userId: "user-expired" };
  if (where?.id === "pet-admin" && where.userId === "user-admin") return { id: "pet-admin", userId: "user-admin" };
  return null;
};

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  if (url.includes("/audio/transcriptions")) {
    return new Response(JSON.stringify({ text: "remind me to feed at 5" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (url.includes("/chat/completions")) {
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            intent: "create_reminder",
            target: "reminder",
            confidence: 0.91,
            draft: {
              type: "FEEDING",
              title: "Feed",
              time: "2026-05-07T14:00:00.000Z",
              repeatRule: null
            },
            warnings: []
          })
        }
      }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  throw new Error(`Unexpected fetch URL: ${url}`);
};

const app = createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});

type JsonResponse = {
  status: number;
  body: { error?: { code?: string }; intent?: string; target?: string; draft?: Record<string, unknown> };
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function signedInitData(telegramId: number) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `voice-smoke-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: "Voice", language_code: "en" })
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

async function voiceRequest(telegramId: number, petId: string, path = "/api/voice/command"): Promise<JsonResponse> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address.");

  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "voice.webm");
  form.set("petId", petId);
  form.set("clientNow", "2026-05-07T12:00:00.000Z");
  form.set("timezone", "Europe/Moscow");
  form.set("locale", "en");

  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(telegramId)}` },
    body: form
  });
  return { status: response.status, body: await response.json() };
}

try {
  const active = await voiceRequest(1001, "pet-owned");
  assert(active.status === 200, `Expected active non-admin user to use voice endpoint, got ${active.status}`);
  assert(active.body.intent === "create_reminder", "Expected parsed reminder intent.");
  assert(active.body.target === "reminder", "Expected reminder target.");

  const expired = await voiceRequest(1002, "pet-expired");
  assert(expired.status === 403, `Expected expired user to be rejected, got ${expired.status}`);
  assert(expired.body.error?.code === "ACCESS_EXPIRED", `Expected ACCESS_EXPIRED, got ${expired.body.error?.code}`);

  const foreignPet = await voiceRequest(1001, "pet-foreign");
  assert(foreignPet.status === 404, `Expected foreign pet to be forbidden as not found, got ${foreignPet.status}`);
  assert(foreignPet.body.error?.code === "PET_NOT_FOUND", `Expected PET_NOT_FOUND, got ${foreignPet.body.error?.code}`);

  const admin = await voiceRequest(1003, "pet-admin", "/api/admin/voice/command");
  assert(admin.status === 200, `Expected admin voice endpoint to keep working, got ${admin.status}`);
  assert(admin.body.intent === "create_reminder", "Expected admin endpoint parsed reminder intent.");

  console.log("Voice endpoint smoke checks passed.");
} finally {
  server.close();
}
