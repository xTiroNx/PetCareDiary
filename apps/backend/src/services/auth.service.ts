import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { validateTelegramInitData } from "./telegramAuth.service.js";
import { normalizeSource, trackAnalyticsEvent } from "./analytics.service.js";
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
      trialEndsAt,
      reactivationTrialGrantedAt: now
    },
    update: {
      username: parsed.user.username,
      firstName: parsed.user.first_name,
      lastName: parsed.user.last_name,
      lastSeenAt: now,
      ...(platform ? { platform } : {}),
      ...(startParam ? { lastStartParam: startParam, source } : {})
    }
  });
  if (!user.languageCode && languageCode) {
    user = await prisma.user.update({ where: { id: user.id }, data: { languageCode } });
  }
  if (startParam && !user.firstStartParam) {
    user = await prisma.user.update({ where: { id: user.id }, data: { firstStartParam: startParam } });
  }

  if (
    !user.lifetimeAccess &&
    !user.reactivationTrialGrantedAt &&
    (!user.accessUntil || user.accessUntil <= now) &&
    user.trialEndsAt <= now
  ) {
    const granted = await prisma.user.updateMany({
      where: {
        id: user.id,
        lifetimeAccess: false,
        reactivationTrialGrantedAt: null,
        trialEndsAt: { lte: now },
        OR: [{ accessUntil: null }, { accessUntil: { lte: now } }]
      },
      data: { trialStartedAt: now, trialEndsAt, reactivationTrialGrantedAt: now }
    });
    if (granted.count > 0) {
      user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      await trackAnalyticsEvent({ userId: user.id, event: "reactivation_trial_started" });
    }
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
