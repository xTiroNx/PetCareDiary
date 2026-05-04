import type { Prisma, Reminder, ReminderType, User } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { adminTelegramIds } from "../utils/admin.js";

type DueReminder = Reminder & { user: Pick<User, "telegramId" | "languageCode"> };

const reminderTypeLabels: Record<ReminderType, string> = {
  FEEDING: "Кормление",
  MEDICINE: "Лекарство",
  WEIGHT: "Взвешивание",
  VET: "Ветеринар",
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

    if (processed > 0) console.log("Reminder scheduler delivered reminders", { processed });

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
