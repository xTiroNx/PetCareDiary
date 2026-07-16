import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.TRIAL_DAYS = "7";

const [{ prisma }, { authenticateTelegram }] = await Promise.all([
  import("../src/prisma/client.js"),
  import("../src/services/auth.service.js")
]);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function signedInitData(telegramId: number) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: "Reactivation" })
  });
  const dataCheck = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(dataCheck).digest("hex"));
  return params.toString();
}

const expiredAt = new Date(Date.now() - 86400000);
const expiredUser = {
  id: "expired-user",
  telegramId: 777000111n,
  username: null,
  firstName: "Expired",
  lastName: null,
  languageCode: "en",
  platform: null,
  firstStartParam: null,
  lastStartParam: null,
  source: null,
  createdAt: expiredAt,
  updatedAt: expiredAt,
  lastSeenAt: expiredAt,
  trialStartedAt: expiredAt,
  trialEndsAt: expiredAt,
  reactivationTrialGrantedAt: null,
  accessUntil: null,
  lifetimeAccess: false
};
let grantedData: { trialStartedAt: Date; trialEndsAt: Date; reactivationTrialGrantedAt: Date } | null = null;

(prisma.user.upsert as unknown as () => Promise<typeof expiredUser>) = async () => expiredUser;
(prisma.user.updateMany as unknown as (args: { data: typeof grantedData }) => Promise<{ count: number }>) = async ({ data }) => {
  grantedData = data;
  return { count: 1 };
};
(prisma.user.findUniqueOrThrow as unknown as () => Promise<typeof expiredUser>) = async () => ({
  ...expiredUser,
  trialStartedAt: grantedData!.trialStartedAt,
  trialEndsAt: grantedData!.trialEndsAt,
  reactivationTrialGrantedAt: grantedData!.reactivationTrialGrantedAt
});
(prisma.user.findUnique as unknown as () => Promise<typeof expiredUser>) = async () => expiredUser;
(prisma.pet.findMany as unknown as () => Promise<unknown[]>) = async () => [];
(prisma.analyticsEvent.create as unknown as () => Promise<unknown>) = async () => ({});

const session = await authenticateTelegram(signedInitData(Number(expiredUser.telegramId)));
assert(session.accessStatus === "trial", `Expected reactivated user status trial, got ${session.accessStatus}.`);
assert(grantedData, "Expected reactivation trial update.");
const durationMs = grantedData!.trialEndsAt.getTime() - grantedData!.trialStartedAt.getTime();
assert(durationMs === 7 * 86400000, `Expected 7-day reactivation trial, got ${durationMs} ms.`);

let activeUpdateAttempted = false;
const activeUser = {
  ...expiredUser,
  id: "active-user",
  telegramId: 777000112n,
  accessUntil: new Date(Date.now() + 30 * 86400000)
};
(prisma.user.upsert as unknown as () => Promise<typeof activeUser>) = async () => activeUser;
(prisma.user.updateMany as unknown as () => Promise<{ count: number }>) = async () => {
  activeUpdateAttempted = true;
  return { count: 0 };
};

const activeSession = await authenticateTelegram(signedInitData(Number(activeUser.telegramId)));
assert(activeSession.accessStatus === "active_monthly", `Expected paid user to stay active, got ${activeSession.accessStatus}.`);
assert(!activeUpdateAttempted, "Paid user must not receive a reactivation trial update.");

console.log("Reactivation trial smoke checks passed.");
