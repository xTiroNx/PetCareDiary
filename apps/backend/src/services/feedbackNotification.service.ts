import type { User } from "@prisma/client";
import { env } from "../config/env.js";
import type { AccessStatus } from "../utils/access.js";
import { adminTelegramIds } from "../utils/admin.js";
import { HttpError } from "../utils/httpError.js";

type FeedbackUser = Pick<User, "telegramId" | "username" | "firstName" | "lastName">;

function configuredFeedbackRecipients() {
  const feedbackIds = env.FEEDBACK_TELEGRAM_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(feedbackIds.length > 0 ? feedbackIds : Array.from(adminTelegramIds()));
}

function formatUserName(user: FeedbackUser) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const username = user.username ? `@${user.username}` : "no username";
  return fullName ? `${fullName} (${username})` : username;
}

function feedbackMessage(input: {
  feedbackId: string;
  user: FeedbackUser;
  accessStatus: AccessStatus;
  page?: string | null;
  message: string;
}) {
  return [
    "PetCare Diary feedback",
    `Feedback ID: ${input.feedbackId}`,
    `Telegram ID: ${input.user.telegramId.toString()}`,
    `User: ${formatUserName(input.user)}`,
    `Access: ${input.accessStatus}`,
    `Page: ${input.page || "unknown"}`,
    "",
    input.message
  ].join("\n");
}

async function sendTelegramMessage(chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description ?? "Telegram sendMessage failed.");
  }
}

export async function sendFeedbackNotification(input: {
  feedbackId: string;
  user: FeedbackUser;
  accessStatus: AccessStatus;
  page?: string | null;
  message: string;
}) {
  const recipients = configuredFeedbackRecipients();
  if (recipients.size === 0) {
    throw new HttpError(503, "FEEDBACK_RECIPIENTS_MISSING", "Feedback recipients are not configured.");
  }

  const text = feedbackMessage(input);
  const errors: string[] = [];

  for (const chatId of recipients) {
    try {
      await sendTelegramMessage(chatId, text);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Telegram sendMessage failed.");
    }
  }

  if (errors.length === recipients.size) {
    throw new HttpError(502, "FEEDBACK_DELIVERY_FAILED", errors[0] ?? "Feedback delivery failed.");
  }

  return { delivered: recipients.size - errors.length, failed: errors.length, errors };
}
