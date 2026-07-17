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
process.env.OPENROUTER_API_KEY_AI_HELPER = "test_openrouter_ai_key";
process.env.OPENROUTER_AI_HELPER_MODEL = "google/gemini-3.1-flash-lite";
process.env.OPENROUTER_AI_HELPER_MODEL_FALLBACK = "minimax/minimax-m3";
process.env.FILE_STORAGE_DRIVER = "local";

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

(prisma.feedingEntry.findMany as unknown as (args: unknown) => Promise<unknown[]>) = async (args) => {
  const orderBy = (args as { orderBy?: { dateTime?: string } }).orderBy;
  assert(orderBy?.dateTime === "desc", "Expected AI assistant to load the newest diary entries first.");
  return [
    { id: "feeding-new", dateTime: new Date(now.getTime() - 60_000), foodType: "WET", amount: "1 pouch", note: null },
    { id: "feeding-old", dateTime: new Date(now.getTime() - 3_600_000), foodType: "DRY", amount: "20 g", note: null }
  ];
};

const realFetch = globalThis.fetch.bind(globalThis);
const providerRequests: unknown[] = [];
let providerCallCount = 0;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("api.minimax") || url.includes("openrouter.ai")) {
    if (typeof init?.body === "string") providerRequests.push(JSON.parse(init.body));
    providerCallCount += 1;
    if (providerCallCount === 1) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      choices: [
        { message: { content: "<think>hidden reasoning</think>* Brief takeaway: keep observing appetite patterns.\n* Ask the veterinarian about appetite changes.\nPlease remember that I am not a veterinarian and this does not replace veterinary care." } }
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

async function postAssistant(input: {
  telegramId: number;
  petId?: string;
  mode?: "VET_QUESTIONS" | "GENERAL_HELP";
  question?: string;
  includeImages?: boolean;
  imageAttachmentIds?: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl()}/api/ai/assistant`, {
    method: "POST",
    headers: {
      Authorization: `tma ${signedInitData(input.telegramId)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      petId: input.petId ?? "pet-active",
      mode: input.mode ?? "VET_QUESTIONS",
      question: input.question,
      period: "7",
      timezone: "Europe/Moscow",
      locale: "en",
      includeImages: input.includeImages ?? false,
      imageAttachmentIds: input.imageAttachmentIds ?? [],
      history: input.history ?? []
    })
  });
  return { status: response.status, body: await response.json() };
}

async function getAssistantPhotos(telegramId: number): Promise<JsonResponse> {
  const query = new URLSearchParams({
    petId: "pet-active",
    period: "7",
    timezone: "Europe/Moscow",
    locale: "en"
  });
  const response = await fetch(`${baseUrl()}/api/ai/photos?${query.toString()}`, {
    headers: { Authorization: `tma ${signedInitData(telegramId)}` }
  });
  return { status: response.status, body: await response.json() };
}

try {
  const active = await postAssistant({
    telegramId: Number(activeUser.telegramId),
    mode: "GENERAL_HELP",
    question: "What should I prepare before a vet visit?",
    includeImages: true,
    history: [
      { role: "user", content: "Has appetite changed?" },
      { role: "assistant", content: "The diary has two feeding records." }
    ]
  });
  assert(active.status === 200, `Expected active non-admin user to access AI assistant, got ${active.status}`);
  assert(typeof active.body === "object" && active.body !== null, "Expected JSON object response for active user.");
  const activeBody = active.body as { answer?: unknown; disclaimer?: unknown; usedPeriod?: unknown; warnings?: unknown };
  assert(typeof activeBody.answer === "string" && activeBody.answer.includes("veterinarian"), "Expected AI answer text.");
  assert(!activeBody.answer.includes("<think>"), "Expected AI answer to be sanitized.");
  assert(!activeBody.answer.includes("* Brief takeaway"), "Expected markdown star bullets to be normalized.");
  assert(activeBody.answer.includes("- Brief takeaway"), "Expected dash bullets in sanitized answer.");
  assert(!/not a veterinarian|does not replace veterinary care/i.test(activeBody.answer), "Expected final boilerplate disclaimer to be stripped from answer.");
  assert(typeof activeBody.disclaimer === "string" && activeBody.disclaimer.length > 0, "Expected disclaimer.");
  assert(activeBody.usedPeriod === 7, "Expected usedPeriod to reflect request period.");
  assert(
    Array.isArray(activeBody.warnings)
    && activeBody.warnings.some((warning) => /image analysis requires R2|No photos were found/.test(String(warning))),
    "Expected includeImages to warn when images cannot be attached."
  );
  assert(providerRequests.length === 2, "Expected invalid primary AI response to trigger one fallback request.");
  const primaryRequest = providerRequests[0] as { model?: string };
  const generalHelpRequest = providerRequests[1] as { model?: string; max_completion_tokens?: number; max_tokens?: number; messages?: Array<{ role?: string; content?: string }> } | undefined;
  assert(primaryRequest.model === "google/gemini-3.1-flash-lite", "Expected Gemini as primary AI helper model.");
  assert(generalHelpRequest?.model === "minimax/minimax-m3", "Expected MiniMax as application-level AI helper fallback.");
  const tokenLimit = generalHelpRequest?.max_completion_tokens ?? generalHelpRequest?.max_tokens;
  assert(tokenLimit === 1400, `Expected AI token limit to be 1400, got ${tokenLimit}`);
  assert(generalHelpRequest.messages?.[0]?.content?.includes("do not force it into a checklist"), "Expected system prompt to avoid mechanical checklist answers.");
  assert(generalHelpRequest.messages?.[0]?.content?.includes("primary evidence"), "Expected system prompt to prioritize selected photos.");
  assert(generalHelpRequest.messages?.[0]?.content?.includes("Inspect every attached image"), "Expected system prompt to require reviewing every selected photo.");
  assert(generalHelpRequest.messages?.[0]?.content?.includes("Do not include a final medical disclaimer"), "Expected system prompt to suppress duplicate disclaimer.");
  assert(generalHelpRequest.messages?.[0]?.content?.includes("Use '-' for bullet points"), "Expected system prompt to require dash bullets.");
  assert(generalHelpRequest.messages?.[0]?.content?.includes("exact local dates"), "Expected system prompt to require dated diary evidence.");
  assert(generalHelpRequest.messages?.[1]?.content === "Has appetite changed?", "Expected short conversation history in provider messages.");
  const currentPrompt = generalHelpRequest.messages?.at(-1)?.content ?? "";
  assert(currentPrompt.includes("\"imageAnalysisEnabled\":false"), "Expected fallback prompt to mark images as not inspected.");
  assert(currentPrompt.includes("\"summary\""), "Expected deterministic diary summary in provider context.");
  assert(currentPrompt.includes("\"feeding\":2"), "Expected feeding totals in diary summary.");
  assert(currentPrompt.includes("\"contextSelection\""), "Expected relevance selection metadata in provider context.");

  const photoCandidates = await getAssistantPhotos(Number(activeUser.telegramId));
  assert(photoCandidates.status === 200, `Expected AI photo candidates endpoint, got ${photoCandidates.status}`);
  const photoBody = photoCandidates.body as { items?: unknown; limit?: unknown; warnings?: unknown };
  assert(Array.isArray(photoBody.items), "Expected AI photo candidate items.");
  assert(photoBody.limit === 3, "Expected configured AI image selection limit.");
  assert(Array.isArray(photoBody.warnings), "Expected AI photo candidate warnings.");

  const paid = await postAssistant({ telegramId: Number(paidUser.telegramId), petId: "pet-paid", mode: "VET_QUESTIONS" });
  assert(paid.status === 200, `Expected paid non-admin user to access AI assistant, got ${paid.status}`);

  const expired = await postAssistant({ telegramId: Number(expiredUser.telegramId) });
  assert(expired.status === 403, `Expected expired user to be rejected, got ${expired.status}`);

  console.log("AI assistant smoke checks passed.");
} finally {
  globalThis.fetch = realFetch;
  server.close();
}
