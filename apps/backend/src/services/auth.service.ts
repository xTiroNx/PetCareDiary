import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { validateTelegramInitData } from "./telegramAuth.service.js";
import { accessEndsAt, getAccessStatus } from "../utils/access.js";
import { isAdminUser } from "../utils/admin.js";

export async function authenticateTelegram(initData: string) {
  const parsed = validateTelegramInitData(initData);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + env.TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(parsed.user.id) },
    create: {
      telegramId: BigInt(parsed.user.id),
      username: parsed.user.username,
      firstName: parsed.user.first_name,
      lastName: parsed.user.last_name,
      languageCode: parsed.user.language_code,
      trialStartedAt: now,
      trialEndsAt
    },
    update: {
      username: parsed.user.username,
      firstName: parsed.user.first_name,
      lastName: parsed.user.last_name,
      languageCode: parsed.user.language_code
    }
  });

  const pets = await prisma.pet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" }
  });

  return {
    user,
    pet: pets[0] ?? null,
    pets,
    isAdmin: isAdminUser(user),
    accessStatus: getAccessStatus(user),
    accessEndsAt: accessEndsAt(user)
  };
}
