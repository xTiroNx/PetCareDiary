import dotenv from "dotenv";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

const [{ env }, { prisma }] = await Promise.all([
  import("../src/config/env.js"),
  import("../src/prisma/client.js")
]);

const releaseId = "free_core_20260717";
const resetEvent = `${releaseId}_trial_reset`;
const broadcastEvent = `${releaseId}_broadcast`;
const trialDays = 7;
const apply = process.argv.includes("--apply");

type TelegramResponse = {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
};

class TelegramSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trialEnd(start: Date) {
  return new Date(start.getTime() + trialDays * 24 * 60 * 60 * 1000);
}

function cleanPetName(value: string | undefined) {
  const name = value?.replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 80) : undefined;
}

function contentFor(languageCode: string | null, petNameValue: string | undefined) {
  const petName = cleanPetName(petNameValue);
  if (languageCode?.toLowerCase().startsWith("ru")) {
    const petLine = petName
      ? `Питомец по имени ${petName} уже готов проверить обновление: поставить напоминание, собрать PDF и убедиться, что важные записи на месте.`
      : "Самое время добавить питомца и сделать первую запись.";
    return { buttonText: "Открыть PetCare Diary", text: [
      "PetCare Diary стал доступнее",
      "",
      "Теперь дневник, новые фотографии, напоминания, отчёты и PDF доступны бесплатно всем пользователям даже после trial.",
      "",
      "Pro нужен только для AI-помощника и голосовых команд. Мы заново включили 7 дней Pro всем пользователям приложения.",
      "",
      petLine
    ].join("\n") };
  }

  const petLine = petName
    ? `${petName} is ready to check the update: set a reminder, build a PDF and make sure every important note is in place.`
    : "This is a good time to add your pet and create the first diary entry.";
  return { buttonText: "Open PetCare Diary", text: [
    "PetCare Diary is now more accessible",
    "",
    "The diary, new photos, reminders, reports and PDF exports are now free for everyone, even after the trial.",
    "",
    "Pro is only needed for the AI helper and voice commands. We have restarted a 7-day Pro trial for every user.",
    "",
    petLine
  ].join("\n") };
}

async function sendTelegramMessage(chatId: bigint, text: string, buttonText: string) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId.toString(),
      text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{
          text: buttonText,
          url: `https://t.me/${env.BOT_USERNAME}?startapp=free-core-update`
        }]]
      }
    })
  });
  const payload = (await response.json().catch(() => null)) as TelegramResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new TelegramSendError(
      payload?.description ?? `Telegram sendMessage failed with HTTP ${response.status}.`,
      response.status,
      payload?.parameters?.retry_after
    );
  }
}

async function sendWithRetry(chatId: bigint, text: string, buttonText: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await sendTelegramMessage(chatId, text, buttonText);
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof TelegramSendError && [400, 401, 403, 404].includes(error.status)) throw error;
      if (attempt < 3) {
        const retryAfter = error instanceof TelegramSendError ? error.retryAfterSeconds : undefined;
        await sleep(retryAfter ? retryAfter * 1000 : attempt * 1000);
      }
    }
  }
  throw lastError;
}

async function resetTrialsOnce() {
  const existing = await prisma.analyticsEvent.findFirst({ where: { event: resetEvent }, select: { id: true } });
  if (existing) {
    console.log("Trial reset already recorded for this release; skipping.");
    return;
  }

  const startedAt = new Date();
  const endsAt = trialEnd(startedAt);
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      data: {
        trialStartedAt: startedAt,
        trialEndsAt: endsAt,
        reactivationTrialGrantedAt: startedAt
      }
    });
    await tx.analyticsEvent.create({
      data: {
        event: resetEvent,
        metadata: { releaseId, updatedUsers: updated.count, startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() }
      }
    });
    return updated;
  });
  console.log("Trial reset complete.", { updatedUsers: result.count, endsAt: endsAt.toISOString() });
}

async function broadcastOnce() {
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      telegramId: true,
      languageCode: true,
      pets: { orderBy: { createdAt: "asc" }, take: 1, select: { name: true } }
    }
  });
  const processed = new Set((await prisma.analyticsEvent.findMany({
    where: { event: broadcastEvent, userId: { not: null } },
    select: { userId: true }
  })).flatMap((item) => item.userId ? [item.userId] : []));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const user of users) {
    if (processed.has(user.id)) {
      skipped += 1;
      continue;
    }
    const petName = user.pets[0]?.name;
    const content = contentFor(user.languageCode, petName);
    try {
      await sendWithRetry(user.telegramId, content.text, content.buttonText);
      sent += 1;
      await prisma.analyticsEvent.create({
        data: {
          event: broadcastEvent,
          userId: user.id,
          metadata: { releaseId, deliveryStatus: "sent", petNameIncluded: Boolean(cleanPetName(petName)) }
        }
      });
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message.slice(0, 300) : "Unknown Telegram delivery error";
      await prisma.analyticsEvent.create({
        data: {
          event: broadcastEvent,
          userId: user.id,
          metadata: { releaseId, deliveryStatus: "failed", reason }
        }
      });
    }
    if ((sent + failed) % 25 === 0) console.log("Broadcast progress.", { sent, failed, skipped });
    await sleep(80);
  }
  console.log("Broadcast complete.", { totalUsers: users.length, sent, failed, skipped });
}

async function main() {
  const [userCount, alreadyReset, broadcastCount] = await Promise.all([
    prisma.user.count(),
    prisma.analyticsEvent.count({ where: { event: resetEvent } }),
    prisma.analyticsEvent.count({ where: { event: broadcastEvent } })
  ]);
  console.log("Free core release plan.", { releaseId, userCount, trialDays, alreadyReset: Boolean(alreadyReset), broadcastCount, apply });
  if (!apply) {
    console.log("Dry run only. Run again with --apply after a database backup and successful deploy.");
    return;
  }
  await resetTrialsOnce();
  await broadcastOnce();
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
