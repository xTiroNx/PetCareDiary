import type { AccessNotificationType, Prisma, Reminder, ReminderType, User } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { adminTelegramIds } from "../utils/admin.js";

type DueReminder = Reminder & { user: Pick<User, "telegramId" | "languageCode"> };

const reminderTypeLabels: Record<ReminderType, string> = {
  FEEDING: "Кормление",
  MEDICINE: "Лекарство",
  WATER: "Питье",
  WEIGHT: "Взвешивание",
  VET: "Ветеринар",
  VACCINATION: "Вакцинация/обработка",
  OTHER: "Другое"
};

let processing = false;
let interval: NodeJS.Timeout | null = null;

function nextReminderTime(time: Date, repeatRule: string | null, now = new Date()) {
  const next = new Date(time);
  while (next <= now) {
    if (repeatRule === "daily") next.setDate(next.getDate() + 1);
    else if (repeatRule === "weekly") next.setDate(next.getDate() + 7);
    else if (repeatRule === "monthly") next.setMonth(next.getMonth() + 1);
    else break;
  }
  return next;
}

function messageFor(reminder: DueReminder) {
  const type = reminderTypeLabels[reminder.type] ?? reminder.type;
  return [
    `PetCare Diary: ${reminder.title}`,
    `Тип: ${type}`,
    "",
    "Откройте Mini App, чтобы отметить или изменить напоминание."
  ].join("\n");
}

function activeAccessFilter(now: Date): Prisma.UserWhereInput {
  const adminIds = Array.from(adminTelegramIds()).flatMap((value) => {
    try {
      return [BigInt(value)];
    } catch {
      return [];
    }
  });
  const filters: Prisma.UserWhereInput[] = [
    { lifetimeAccess: true },
    { accessUntil: { gt: now } },
    { trialEndsAt: { gt: now } }
  ];

  if (adminIds.length > 0) filters.push({ telegramId: { in: adminIds } });
  return { OR: filters };
}

async function sendTelegramMessage(chatId: bigint, text: string) {
  const miniAppUrl = env.BOT_USERNAME ? `https://t.me/${env.BOT_USERNAME}?startapp=reminders` : undefined;
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId.toString(),
      text,
      disable_web_page_preview: true,
      ...(miniAppUrl
        ? {
            reply_markup: {
              inline_keyboard: [[{ text: "Открыть PetCare Diary", url: miniAppUrl }]]
            }
          }
        : {})
    })
  });

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description ?? "Telegram sendMessage failed.");
  }
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function utcDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) return { error: "unknown" };
  return { error: error.name, message: error.message };
}

async function createAccessNotificationLog(input: {
  userId: string;
  type: AccessNotificationType;
  dayKey?: string | null;
  relatedPaymentId?: string | null;
}) {
  try {
    await prisma.accessNotificationLog.create({
      data: {
        userId: input.userId,
        type: input.type,
        dayKey: input.dayKey ?? null,
        relatedPaymentId: input.relatedPaymentId ?? null
      }
    });
    return true;
  } catch (error) {
    if (isUniqueConflict(error)) return false;
    throw error;
  }
}

async function hasAccessNotificationLog(input: {
  userId: string;
  type: AccessNotificationType;
  dayKey?: string | null;
  relatedPaymentId?: string | null;
}) {
  const existing = await prisma.accessNotificationLog.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      dayKey: input.dayKey ?? null,
      relatedPaymentId: input.relatedPaymentId ?? null
    },
    select: { id: true }
  });
  return Boolean(existing);
}

function accessNotificationMessage(type: AccessNotificationType, date?: Date | null) {
  const datePart = date ? `\nДата: ${date.toLocaleDateString("ru-RU", { timeZone: "UTC" })}` : "";
  if (type === "TRIAL_ENDING_SOON") {
    return `PetCare Diary: trial закончится завтра.${datePart}\n\nОткройте Mini App, чтобы продлить доступ, если хотите продолжить вести дневник.`;
  }
  if (type === "PAID_ENDING_SOON") {
    return `PetCare Diary: оплаченный доступ закончится через 3 дня.${datePart}\n\nОткройте Mini App, чтобы продлить доступ заранее.`;
  }
  return "PetCare Diary: доступ закончился.\n\nОткройте Mini App, чтобы продлить доступ и продолжить вести дневник питомца.";
}

async function sendLoggedAccessNotification(input: {
  user: Pick<User, "id" | "telegramId">;
  type: AccessNotificationType;
  dayKey: string;
  date?: Date | null;
}) {
  const alreadySent = await hasAccessNotificationLog({ userId: input.user.id, type: input.type, dayKey: input.dayKey });
  if (alreadySent) return false;
  try {
    await sendTelegramMessage(input.user.telegramId, accessNotificationMessage(input.type, input.date));
  } catch (error) {
    // Avoid retrying the same expired/trial access notification every scheduler tick
    // when Telegram can no longer deliver to a chat.
    await createAccessNotificationLog({ userId: input.user.id, type: input.type, dayKey: input.dayKey });
    throw error;
  }
  return createAccessNotificationLog({ userId: input.user.id, type: input.type, dayKey: input.dayKey });
}

function expiredAccessWhere(now: Date): Prisma.UserWhereInput {
  return {
    lifetimeAccess: false,
    trialEndsAt: { lt: now },
    OR: [{ accessUntil: null }, { accessUntil: { lt: now } }]
  };
}

async function loadExpiredUsersWithoutLog(now: Date, limit = 50) {
  const users: Array<Pick<User, "id" | "telegramId" | "trialEndsAt" | "accessUntil">> = [];
  const take = 50;
  let skip = 0;

  while (users.length < limit) {
    const batch = await prisma.user.findMany({
      where: expiredAccessWhere(now),
      select: { id: true, telegramId: true, trialEndsAt: true, accessUntil: true },
      orderBy: [{ trialEndsAt: "asc" }, { id: "asc" }],
      skip,
      take
    });
    if (!batch.length) break;
    skip += batch.length;

    for (const user of batch) {
      const accessEndedAt = user.accessUntil && user.accessUntil > user.trialEndsAt ? user.accessUntil : user.trialEndsAt;
      const alreadySent = await hasAccessNotificationLog({
        userId: user.id,
        type: "ACCESS_EXPIRED",
        dayKey: utcDayKey(accessEndedAt)
      });
      if (!alreadySent) users.push(user);
      if (users.length >= limit) break;
    }

    if (batch.length < take) break;
  }

  return users;
}

async function processAccessNotifications(now = new Date()) {
  const today = startOfUtcDay(now);
  const tomorrowStart = addUtcDays(today, 1);
  const tomorrowEnd = addUtcDays(today, 2);
  const paidEndingStart = addUtcDays(today, 3);
  const paidEndingEnd = addUtcDays(today, 4);
  let processed = 0;

  const [trialEnding, paidEnding, expired] = await Promise.all([
    prisma.user.findMany({
      where: {
        lifetimeAccess: false,
        trialEndsAt: { gte: tomorrowStart, lt: tomorrowEnd },
        OR: [{ accessUntil: null }, { accessUntil: { lte: now } }],
        accessNotificationLogs: {
          none: { type: "TRIAL_ENDING_SOON", dayKey: utcDayKey(tomorrowStart) }
        }
      },
      select: { id: true, telegramId: true, trialEndsAt: true },
      orderBy: { trialEndsAt: "asc" },
      take: 50
    }),
    prisma.user.findMany({
      where: {
        lifetimeAccess: false,
        accessUntil: { gte: paidEndingStart, lt: paidEndingEnd },
        accessNotificationLogs: {
          none: { type: "PAID_ENDING_SOON", dayKey: utcDayKey(paidEndingStart) }
        }
      },
      select: { id: true, telegramId: true, accessUntil: true },
      orderBy: { accessUntil: "asc" },
      take: 50
    }),
    loadExpiredUsersWithoutLog(now, 50)
  ]);

  for (const user of trialEnding) {
    try {
      if (await sendLoggedAccessNotification({
        user,
        type: "TRIAL_ENDING_SOON",
        dayKey: utcDayKey(user.trialEndsAt),
        date: user.trialEndsAt
      })) processed += 1;
    } catch (error) {
      console.warn(JSON.stringify({ event: "access_notification_failed", userId: user.id, type: "TRIAL_ENDING_SOON", ...errorDetails(error) }));
    }
  }

  for (const user of paidEnding) {
    try {
      if (user.accessUntil && await sendLoggedAccessNotification({
        user,
        type: "PAID_ENDING_SOON",
        dayKey: utcDayKey(user.accessUntil),
        date: user.accessUntil
      })) processed += 1;
    } catch (error) {
      console.warn(JSON.stringify({ event: "access_notification_failed", userId: user.id, type: "PAID_ENDING_SOON", ...errorDetails(error) }));
    }
  }

  for (const user of expired) {
    const accessEndedAt = user.accessUntil && user.accessUntil > user.trialEndsAt ? user.accessUntil : user.trialEndsAt;
    try {
      if (await sendLoggedAccessNotification({
        user,
        type: "ACCESS_EXPIRED",
        dayKey: utcDayKey(accessEndedAt),
        date: accessEndedAt
      })) processed += 1;
    } catch (error) {
      console.warn(JSON.stringify({ event: "access_notification_failed", userId: user.id, type: "ACCESS_EXPIRED", ...errorDetails(error) }));
    }
  }

  if (processed > 0) console.log("Access notification scheduler delivered messages", { processed });
  return processed;
}

export async function sendPaymentReceiptNotification(paymentId: string) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: { select: { id: true, telegramId: true } } }
    });
    if (!payment || payment.status !== "PAID") return false;

    const alreadySent = await hasAccessNotificationLog({
      userId: payment.userId,
      type: "PAYMENT_RECEIPT",
      relatedPaymentId: payment.id
    });
    if (alreadySent) return false;

    const text = [
      "PetCare Diary: оплата прошла успешно.",
      `Тариф: ${payment.productType}`,
      `Сумма: ${payment.amountStars} Stars`,
      "",
      "Спасибо! Доступ уже обновлен."
    ].join("\n");
    await sendTelegramMessage(payment.user.telegramId, text);
    return createAccessNotificationLog({
      userId: payment.userId,
      type: "PAYMENT_RECEIPT",
      relatedPaymentId: payment.id
    });
  } catch (error) {
    console.warn(JSON.stringify({
      event: "payment_receipt_notification_failed",
      paymentId,
      ...errorDetails(error)
    }));
    return false;
  }
}

export async function processDueReminders() {
  if (processing) return { processed: 0, skipped: true };
  processing = true;
  const now = new Date();
  let processed = 0;

  try {
    const reminders = await prisma.reminder.findMany({
      where: { active: true, time: { lte: now }, user: activeAccessFilter(now) },
      orderBy: { time: "asc" },
      take: 25,
      include: { user: { select: { telegramId: true, languageCode: true } } }
    });

    for (const reminder of reminders) {
      try {
        await sendTelegramMessage(reminder.user.telegramId, messageFor(reminder));
        const nextTime = nextReminderTime(reminder.time, reminder.repeatRule, now);
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: reminder.repeatRule
            ? { time: nextTime, lastSentAt: now, lastDeliveryError: null }
            : { active: false, lastSentAt: now, lastDeliveryError: null }
        });
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Reminder delivery failed.";
        console.error("Reminder delivery failed", { reminderId: reminder.id, userId: reminder.userId, error: message });
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { lastDeliveryError: message.slice(0, 500) }
        });
      }
    }

    processed += await processAccessNotifications(now);

    if (processed > 0) console.log("Reminder scheduler delivered messages", { processed });

    return { processed };
  } finally {
    processing = false;
  }
}

export function startReminderScheduler() {
  if (!env.REMINDER_SCHEDULER_ENABLED || interval) return;

  const run = () => {
    processDueReminders().catch((error) => {
      console.error("Reminder scheduler failed", error);
    });
  };

  interval = setInterval(run, env.REMINDER_POLL_INTERVAL_MS);
  interval.unref?.();
  run();
}
