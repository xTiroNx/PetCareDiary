import type { User } from "@prisma/client";
import { isAdminUser } from "./admin.js";

type AccessUser = Pick<User, "telegramId" | "trialEndsAt" | "accessUntil" | "lifetimeAccess">;

export type AccessStatus = "admin" | "trial" | "active_monthly" | "lifetime" | "expired";

export function getAccessStatus(user: AccessUser): AccessStatus {
  const now = new Date();
  if (isAdminUser(user)) return "admin";
  if (user.lifetimeAccess) return "lifetime";
  if (user.accessUntil && user.accessUntil > now) return "active_monthly";
  if (user.trialEndsAt > now) return "trial";
  return "expired";
}

export function hasActiveAccess(user: AccessUser) {
  return getAccessStatus(user) !== "expired";
}

export function accessEndsAt(user: AccessUser) {
  if (isAdminUser(user)) return null;
  if (user.lifetimeAccess) return null;
  const dates = [user.trialEndsAt, user.accessUntil].filter(Boolean) as Date[];
  return dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}
