import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { validateTelegramInitData } from "./telegramAuth.service.js";
import { normalizeSource } from "./analytics.service.js";
import { accessEndsAt, getAccessStatus } from "../utils/access.js";
import { isAdminUser } from "../utils/admin.js";
import { publicPetSelect, serializePet } from "../utils/petSerialization.js";

function optionalText(value?: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function authenticateTelegram(initData: string, acquisition?: {
  platform?: string;
  startParam?: string;
  languageCode?: string;
}) {
  const parsed = validateTelegramInitData(initData);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + env.TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const platform = optionalText(acquisition?.platform);
  const startParam = optionalText(acquisition?.startParam);
  const languageCode = optionalText(acquisition?.languageCode) ?? parsed.user.language_code;
  const source = normalizeSource(startParam);

  let user = await prisma.user.upsert({
    where: { telegramId: BigInt(parsed.user.id) },
    create: {
      telegramId: BigInt(parsed.user.id),
      username: parsed.user.username,
      firstName: parsed.user.first_name,
      lastName: parsed.user.last_name,
      languageCode,
      platform,
      firstStartParam: startParam,
      lastStartParam: startParam,
      source,
      lastSeenAt: now,
      trialStartedAt: now,
      trialEndsAt
    },
    update: {
      username: parsed.user.username,
      firstName: parsed.user.first_name,
      lastName: parsed.user.last_name,
      languageCode,
      lastSeenAt: now,
      ...(platform ? { platform } : {}),
      ...(startParam ? { lastStartParam: startParam, source } : {})
    }
  });
  if (startParam && !user.firstStartParam) {
    user = await prisma.user.update({ where: { id: user.id }, data: { firstStartParam: startParam } });
  }

  const pets = await prisma.pet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: publicPetSelect
  });
  const publicPets = pets.map(serializePet);

  return {
    user,
    pet: publicPets[0] ?? null,
    pets: publicPets,
    isAdmin: isAdminUser(user),
    accessStatus: getAccessStatus(user),
    accessEndsAt: accessEndsAt(user)
  };
}
