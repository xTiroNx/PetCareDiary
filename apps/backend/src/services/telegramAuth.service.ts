import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import type { TelegramAuthUser } from "../types.js";
import { HttpError } from "../utils/httpError.js";

type ParsedInitData = {
  user: TelegramAuthUser;
  authDate: Date;
  raw: URLSearchParams;
};

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().max(256).optional(),
  last_name: z.string().max(256).optional(),
  username: z.string().max(128).optional(),
  language_code: z.string().max(16).optional()
}).passthrough();

export function validateTelegramInitData(initData: string): ParsedInitData {
  if (!initData) {
    throw new HttpError(401, "INIT_DATA_REQUIRED", "Telegram initData is required.");
  }
  if (initData.length > 8192) {
    throw new HttpError(401, "INIT_DATA_TOO_LARGE", "Telegram initData is too large.");
  }

  if (env.NODE_ENV === "development" && env.ENABLE_DEV_AUTH && initData === "dev-browser-session") {
    return {
      user: {
        id: env.DEV_TELEGRAM_ID,
        first_name: "Dev",
        last_name: "Tester",
        username: "petcare_dev",
        language_code: "ru"
      },
      authDate: new Date(),
      raw: new URLSearchParams()
    };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new HttpError(401, "INIT_DATA_HASH_MISSING", "Telegram initData hash is missing.");
  }
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw new HttpError(401, "INIT_DATA_HASH_INVALID", "Telegram initData hash format is invalid.");
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(hash, "hex"));

  if (!isValid) {
    throw new HttpError(401, "INIT_DATA_INVALID", "Telegram initData signature is invalid.");
  }

  const authDateRaw = params.get("auth_date");
  const authDateSeconds = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDateSeconds)) {
    throw new HttpError(401, "AUTH_DATE_INVALID", "Telegram auth_date is invalid.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDateSeconds > 24 * 60 * 60) {
    throw new HttpError(401, "INIT_DATA_EXPIRED", "Telegram initData is older than 24 hours.");
  }
  if (authDateSeconds - nowSeconds > 5 * 60) {
    throw new HttpError(401, "INIT_DATA_FROM_FUTURE", "Telegram initData auth_date is too far in the future.");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new HttpError(401, "TELEGRAM_USER_MISSING", "Telegram user is missing in initData.");
  }

  let user: TelegramAuthUser;
  try {
    user = telegramUserSchema.parse(JSON.parse(userRaw)) as TelegramAuthUser;
  } catch {
    throw new HttpError(401, "TELEGRAM_USER_INVALID", "Telegram user payload is invalid.");
  }
  if (!user.id) {
    throw new HttpError(401, "TELEGRAM_USER_INVALID", "Telegram user id is missing.");
  }

  return {
    user,
    authDate: new Date(authDateSeconds * 1000),
    raw: params
  };
}
