import type { AccessNotificationType, Prisma, Reminder, ReminderType, User } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";

type DueReminder = Reminder & { user: Pick<User, "telegramId" | "languageCode"> };
type SupportedLanguage = "ru" | "en" | "es" | "fr" | "de" | "zh";

const languageLocales: Record<SupportedLanguage, string> = {
  ru: "ru-RU", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", zh: "zh-CN"
};

const botCopy: Record<SupportedLanguage, {
  typeLabels: Record<ReminderType, string>;
  typePrefix: string;
  reminderHint: string;
  openApp: string;
  trialEnding: string;
  paidEnding: string;
  accessExpired: string;
  coreFree: string;
  proRenew: string;
  date: string;
  paymentSuccess: string;
  plan: string;
  amount: string;
  paymentThanks: string;
}> = {
  en: {
    typeLabels: { FEEDING: "Feeding", MEDICINE: "Medicine", WATER: "Water", WEIGHT: "Weighing", VET: "Veterinarian", VACCINATION: "Vaccination/treatment", OTHER: "Other" },
    typePrefix: "Type", reminderHint: "Open the Mini App to mark or edit the reminder.", openApp: "Open PetCare Diary",
    trialEnding: "Your Pro trial ends tomorrow.", paidEnding: "Your paid Pro access ends in 3 days.", accessExpired: "Your Pro access has ended.",
    coreFree: "Diary, photos, reminders, reports and PDF remain free.", proRenew: "Renew Pro to keep using the AI assistant and voice commands.", date: "Date",
    paymentSuccess: "Payment completed successfully.", plan: "Plan", amount: "Amount", paymentThanks: "Thank you! Your access has already been updated."
  },
  ru: {
    typeLabels: { FEEDING: "Кормление", MEDICINE: "Лекарство", WATER: "Питье", WEIGHT: "Взвешивание", VET: "Ветеринар", VACCINATION: "Вакцинация/обработка", OTHER: "Другое" },
    typePrefix: "Тип", reminderHint: "Откройте Mini App, чтобы отметить или изменить напоминание.", openApp: "Открыть PetCare Diary",
    trialEnding: "Пробный Pro закончится завтра.", paidEnding: "Оплаченный Pro закончится через 3 дня.", accessExpired: "Доступ Pro закончился.",
    coreFree: "Дневник, фото, напоминания, отчёты и PDF останутся бесплатными.", proRenew: "Продлите Pro для AI-помощника и голосовых команд.", date: "Дата",
    paymentSuccess: "Оплата прошла успешно.", plan: "Тариф", amount: "Сумма", paymentThanks: "Спасибо! Доступ уже обновлён."
  },
  es: {
    typeLabels: { FEEDING: "Comida", MEDICINE: "Medicina", WATER: "Agua", WEIGHT: "Peso", VET: "Veterinario", VACCINATION: "Vacuna/tratamiento", OTHER: "Otro" },
    typePrefix: "Tipo", reminderHint: "Abre la Mini App para marcar o editar el recordatorio.", openApp: "Abrir PetCare Diary",
    trialEnding: "Tu prueba Pro termina mañana.", paidEnding: "Tu acceso Pro de pago termina en 3 días.", accessExpired: "Tu acceso Pro ha terminado.",
    coreFree: "El diario, las fotos, los recordatorios, los informes y los PDF siguen siendo gratuitos.", proRenew: "Renueva Pro para seguir usando el asistente IA y los comandos de voz.", date: "Fecha",
    paymentSuccess: "Pago completado correctamente.", plan: "Plan", amount: "Importe", paymentThanks: "Gracias. Tu acceso ya está actualizado."
  },
  fr: {
    typeLabels: { FEEDING: "Repas", MEDICINE: "Médicament", WATER: "Eau", WEIGHT: "Pesée", VET: "Vétérinaire", VACCINATION: "Vaccin/soin", OTHER: "Autre" },
    typePrefix: "Type", reminderHint: "Ouvrez la Mini App pour valider ou modifier le rappel.", openApp: "Ouvrir PetCare Diary",
    trialEnding: "Votre essai Pro se termine demain.", paidEnding: "Votre accès Pro payant se termine dans 3 jours.", accessExpired: "Votre accès Pro est terminé.",
    coreFree: "Le journal, les photos, les rappels, les rapports et les PDF restent gratuits.", proRenew: "Renouvelez Pro pour continuer à utiliser l'assistant IA et les commandes vocales.", date: "Date",
    paymentSuccess: "Paiement effectué.", plan: "Formule", amount: "Montant", paymentThanks: "Merci. Votre accès est déjà mis à jour."
  },
  de: {
    typeLabels: { FEEDING: "Fütterung", MEDICINE: "Medikament", WATER: "Trinken", WEIGHT: "Wiegen", VET: "Tierarzt", VACCINATION: "Impfung/Behandlung", OTHER: "Anderes" },
    typePrefix: "Typ", reminderHint: "Öffne die Mini App, um die Erinnerung zu bestätigen oder zu bearbeiten.", openApp: "PetCare Diary öffnen",
    trialEnding: "Dein Pro-Test endet morgen.", paidEnding: "Dein bezahlter Pro-Zugang endet in 3 Tagen.", accessExpired: "Dein Pro-Zugang ist beendet.",
    coreFree: "Tagebuch, Fotos, Erinnerungen, Berichte und PDFs bleiben kostenlos.", proRenew: "Verlängere Pro für den KI-Helfer und Sprachbefehle.", date: "Datum",
    paymentSuccess: "Zahlung erfolgreich.", plan: "Tarif", amount: "Betrag", paymentThanks: "Danke. Dein Zugang wurde bereits aktualisiert."
  },
  zh: {
    typeLabels: { FEEDING: "喂食", MEDICINE: "用药", WATER: "饮水", WEIGHT: "称重", VET: "兽医", VACCINATION: "疫苗/护理", OTHER: "其他" },
    typePrefix: "类型", reminderHint: "打开 Mini App 可确认或编辑提醒。", openApp: "打开 PetCare Diary",
    trialEnding: "你的 Pro 试用将于明天结束。", paidEnding: "你的付费 Pro 将于 3 天后结束。", accessExpired: "你的 Pro 权限已结束。",
    coreFree: "日记、照片、提醒、报告和 PDF 仍可免费使用。", proRenew: "续订 Pro 可继续使用 AI 助手和语音命令。", date: "日期",
    paymentSuccess: "付款成功。", plan: "套餐", amount: "金额", paymentThanks: "谢谢，权限已更新。"
  }
};

function supportedLanguage(value?: string | null): SupportedLanguage {
  const language = value?.toLowerCase().split(/[-_]/)[0];
  return language && language in botCopy ? language as SupportedLanguage : "en";
}

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

export function messageFor(reminder: DueReminder) {
  const copy = botCopy[supportedLanguage(reminder.user.languageCode)];
  const type = copy.typeLabels[reminder.type] ?? reminder.type;
  return [
    `PetCare Diary: ${reminder.title}`,
    `${copy.typePrefix}: ${type}`,
    "",
    copy.reminderHint
  ].join("\n");
}

async function sendTelegramMessage(chatId: bigint, text: string, languageCode?: string | null) {
  const copy = botCopy[supportedLanguage(languageCode)];
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
              inline_keyboard: [[{ text: copy.openApp, url: miniAppUrl }]]
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

export function accessNotificationMessage(type: AccessNotificationType, date?: Date | null, languageCode?: string | null) {
  const language = supportedLanguage(languageCode);
  const copy = botCopy[language];
  const datePart = date ? `\n${copy.date}: ${date.toLocaleDateString(languageLocales[language], { timeZone: "UTC" })}` : "";
  if (type === "TRIAL_ENDING_SOON") {
    return `PetCare Diary: ${copy.trialEnding}${datePart}\n\n${copy.coreFree} ${copy.proRenew}`;
  }
  if (type === "PAID_ENDING_SOON") {
    return `PetCare Diary: ${copy.paidEnding}${datePart}\n\n${copy.coreFree} ${copy.proRenew}`;
  }
  return `PetCare Diary: ${copy.accessExpired}${datePart}\n\n${copy.coreFree} ${copy.proRenew}`;
}

export function paymentReceiptMessage(productType: string, amountStars: number, languageCode?: string | null) {
  const copy = botCopy[supportedLanguage(languageCode)];
  return [
    `PetCare Diary: ${copy.paymentSuccess}`,
    `${copy.plan}: ${productType}`,
    `${copy.amount}: ${amountStars} Stars`,
    "",
    copy.paymentThanks
  ].join("\n");
}

async function sendLoggedAccessNotification(input: {
  user: Pick<User, "id" | "telegramId" | "languageCode">;
  type: AccessNotificationType;
  dayKey: string;
  date?: Date | null;
}) {
  const alreadySent = await hasAccessNotificationLog({ userId: input.user.id, type: input.type, dayKey: input.dayKey });
  if (alreadySent) return false;
  try {
    await sendTelegramMessage(input.user.telegramId, accessNotificationMessage(input.type, input.date, input.user.languageCode), input.user.languageCode);
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
  const users: Array<Pick<User, "id" | "telegramId" | "languageCode" | "trialEndsAt" | "accessUntil">> = [];
  const take = 50;
  let skip = 0;

  while (users.length < limit) {
    const batch = await prisma.user.findMany({
      where: expiredAccessWhere(now),
      select: { id: true, telegramId: true, languageCode: true, trialEndsAt: true, accessUntil: true },
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
      select: { id: true, telegramId: true, languageCode: true, trialEndsAt: true },
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
      select: { id: true, telegramId: true, languageCode: true, accessUntil: true },
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
      include: { user: { select: { id: true, telegramId: true, languageCode: true } } }
    });
    if (!payment || payment.status !== "PAID") return false;

    const alreadySent = await hasAccessNotificationLog({
      userId: payment.userId,
      type: "PAYMENT_RECEIPT",
      relatedPaymentId: payment.id
    });
    if (alreadySent) return false;

    const text = paymentReceiptMessage(payment.productType, payment.amountStars, payment.user.languageCode);
    await sendTelegramMessage(payment.user.telegramId, text, payment.user.languageCode);
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
      where: { active: true, time: { lte: now }, lastDeliveryError: null },
      orderBy: { time: "asc" },
      take: 25,
      include: { user: { select: { telegramId: true, languageCode: true } } }
    });

    for (const reminder of reminders) {
      try {
        await sendTelegramMessage(reminder.user.telegramId, messageFor(reminder), reminder.user.languageCode);
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
