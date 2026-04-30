import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma/client.js";
import { validateTelegramInitData } from "../services/telegramAuth.service.js";
import { isAdminUser } from "../utils/admin.js";
import { HttpError } from "../utils/httpError.js";

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const initData = req.header("X-Telegram-Init-Data") ?? req.header("Authorization")?.replace(/^tma\s+/i, "");
    if (!initData) throw new HttpError(401, "INIT_DATA_REQUIRED", "Telegram initData is required.");

    const parsed = validateTelegramInitData(initData);
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(parsed.user.id) } });
    if (!user) throw new HttpError(401, "USER_NOT_FOUND", "Authenticate first via /api/auth/telegram.");

    req.user = user;
    req.isAdmin = isAdminUser(user);
    req.telegramInitData = initData;
    next();
  } catch (error) {
    next(error);
  }
}
