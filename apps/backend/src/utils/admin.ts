import type { User } from "@prisma/client";
import { env } from "../config/env.js";

function normalizeTelegramId(value: bigint | number | string) {
  return String(value).trim();
}

export function adminTelegramIds() {
  const configured = env.ADMIN_TELEGRAM_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (env.ENABLE_DEV_AUTH) {
    configured.push(String(env.DEV_TELEGRAM_ID));
  }

  return new Set(configured);
}

export function isAdminTelegramId(telegramId: bigint | number | string) {
  return adminTelegramIds().has(normalizeTelegramId(telegramId));
}

export function isAdminUser(user: Pick<User, "telegramId">) {
  return isAdminTelegramId(user.telegramId);
}
