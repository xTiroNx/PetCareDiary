import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";

export const analyticsEvents = [
  "app_opened",
  "onboarding_started",
  "pet_create_clicked",
  "pet_created",
  "first_entry_created",
  "paywall_opened",
  "invoice_created",
  "invoice_opened",
  "payment_success",
  "feeding_created",
  "medicine_created",
  "symptom_created",
  "weight_created",
  "note_created",
  "reminder_created",
  "voice_clicked",
  "voice_draft_created",
  "report_preview_opened",
  "pdf_export_clicked",
  "feedback_sent",
  "water_created",
  "vaccination_created",
  "ai_assistant_used"
] as const;

export type AnalyticsEventName = typeof analyticsEvents[number];
export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

type TrackInput = {
  userId?: string | null;
  telegramId?: bigint | number | string | null;
  event: AnalyticsEventName;
  languageCode?: string | null;
  platform?: string | null;
  startParam?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

const funnelEvents: Array<{ key: AnalyticsEventName; label: string }> = [
  { key: "app_opened", label: "Opened app" },
  { key: "onboarding_started", label: "Started onboarding" },
  { key: "pet_create_clicked", label: "Clicked pet create" },
  { key: "pet_created", label: "Created pet" },
  { key: "first_entry_created", label: "Created first entry" },
  { key: "paywall_opened", label: "Opened paywall" },
  { key: "invoice_opened", label: "Opened invoice" },
  { key: "payment_success", label: "Paid" }
];

function periodFrom(period: AnalyticsPeriod) {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function conversion(count: number, previous: number | null) {
  if (!previous) return previous === null ? null : 0;
  return Number(((count / previous) * 100).toFixed(1));
}

function userKey(event: Pick<AnalyticsEventRecord, "userId" | "telegramId">) {
  if (event.userId) return `user:${event.userId}`;
  if (event.telegramId) return `telegram:${event.telegramId.toString()}`;
  return null;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeNullable(value?: string | null, max = 128) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function normalizeSource(startParam?: string | null) {
  const value = normalizeNullable(startParam);
  if (!value) return "direct";
  if (value.startsWith("aff_")) return value;
  if (["telegram_ads", "profile_button", "direct", "unknown"].includes(value)) return value;
  return value;
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 200);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1));
  if (!value || typeof value !== "object") return null;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/initdata|token|secret|audio|transcript|feedback|message|note|text/i.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key.slice(0, 80)] = sanitizeMetadataValue(child, depth + 1);
  }
  return output;
}

function sanitizeMetadata(metadata?: Record<string, unknown> | null) {
  if (!metadata) return undefined;
  const sanitized = sanitizeMetadataValue(metadata) as Record<string, unknown>;
  const json = JSON.stringify(sanitized);
  if (json.length <= 4000) return sanitized as Prisma.InputJsonObject;
  return { truncated: true } satisfies Prisma.InputJsonObject;
}

function toBigInt(value: TrackInput["telegramId"]) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export async function trackAnalyticsEvent(input: TrackInput) {
  try {
    const user = input.userId
      ? await prisma.user.findUnique({
          where: { id: input.userId },
          select: { telegramId: true, languageCode: true, platform: true, lastStartParam: true, firstStartParam: true, source: true }
        })
      : null;

    const startParam = normalizeNullable(input.startParam ?? user?.lastStartParam ?? user?.firstStartParam, 128);
    const source = normalizeNullable(input.source ?? user?.source, 128) ?? normalizeSource(startParam);

    await prisma.analyticsEvent.create({
      data: {
        userId: input.userId ?? null,
        telegramId: toBigInt(input.telegramId) ?? user?.telegramId ?? null,
        event: input.event,
        languageCode: normalizeNullable(input.languageCode ?? user?.languageCode, 16),
        platform: normalizeNullable(input.platform ?? user?.platform, 32),
        startParam,
        source,
        metadata: sanitizeMetadata(input.metadata)
      }
    });
  } catch (error) {
    console.warn(JSON.stringify({
      event: "analytics_track_failed",
      analyticsEvent: input.event,
      userId: input.userId,
      error: error instanceof Error ? error.name : "unknown"
    }));
  }
}

export async function hasAnyDiaryEntry(userId: string) {
  const [feeding, symptoms, medicines, weights, notes, water, vaccinations] = await Promise.all([
    prisma.feedingEntry.findFirst({ where: { userId }, select: { id: true } }),
    prisma.symptomEntry.findFirst({ where: { userId }, select: { id: true } }),
    prisma.medicineEntry.findFirst({ where: { userId }, select: { id: true } }),
    prisma.weightEntry.findFirst({ where: { userId }, select: { id: true } }),
    prisma.noteEntry.findFirst({ where: { userId }, select: { id: true } }),
    prisma.waterEntry.findFirst({ where: { userId }, select: { id: true } }),
    prisma.vaccinationEntry.findFirst({ where: { userId }, select: { id: true } })
  ]);
  return Boolean(feeding || symptoms || medicines || weights || notes || water || vaccinations);
}

type AnalyticsEventRecord = Awaited<ReturnType<typeof loadAnalyticsEvents>>[number];

async function loadAnalyticsEvents(period: AnalyticsPeriod, limit?: number) {
  const from = periodFrom(period);
  return prisma.analyticsEvent.findMany({
    where: from ? { createdAt: { gte: from } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      event: true,
      userId: true,
      telegramId: true,
      languageCode: true,
      platform: true,
      startParam: true,
      source: true,
      metadata: true
    }
  });
}

function uniqueUsersFor(events: AnalyticsEventRecord[], eventName: AnalyticsEventName) {
  const users = new Set<string>();
  events.forEach((event) => {
    if (event.event !== eventName) return;
    const key = userKey(event);
    if (key) users.add(key);
  });
  return users;
}

function eventCounts(events: AnalyticsEventRecord[]) {
  const counts = new Map<string, number>();
  events.forEach((event) => counts.set(event.event, (counts.get(event.event) ?? 0) + 1));
  return counts;
}

function emptyBreakdownRow(key: string, value: string | null) {
  return {
    [key]: value ?? "unknown",
    users: new Set<string>(),
    appOpened: new Set<string>(),
    petCreated: new Set<string>(),
    firstEntryCreated: new Set<string>(),
    paywallOpened: new Set<string>(),
    invoiceOpened: new Set<string>(),
    paymentSuccess: new Set<string>()
  };
}

function addBreakdownEvent(row: ReturnType<typeof emptyBreakdownRow>, event: AnalyticsEventRecord) {
  const key = userKey(event);
  if (!key) return;
  row.users.add(key);
  if (event.event === "app_opened") row.appOpened.add(key);
  if (event.event === "pet_created") row.petCreated.add(key);
  if (event.event === "first_entry_created") row.firstEntryCreated.add(key);
  if (event.event === "paywall_opened") row.paywallOpened.add(key);
  if (event.event === "invoice_opened") row.invoiceOpened.add(key);
  if (event.event === "payment_success") row.paymentSuccess.add(key);
}

function serializeBreakdownRow(row: ReturnType<typeof emptyBreakdownRow>, extra: Record<string, string> = {}) {
  const users = row.users.size || row.appOpened.size;
  return {
    ...extra,
    users,
    appOpened: row.appOpened.size,
    petCreated: row.petCreated.size,
    firstEntryCreated: row.firstEntryCreated.size,
    paywallOpened: row.paywallOpened.size,
    invoiceOpened: row.invoiceOpened.size,
    paymentSuccess: row.paymentSuccess.size,
    petConversion: conversion(row.petCreated.size, users) ?? 0,
    firstEntryConversion: conversion(row.firstEntryCreated.size, users) ?? 0,
    paymentConversion: conversion(row.paymentSuccess.size, users) ?? 0
  };
}

function breakdownsFromEvents(events: AnalyticsEventRecord[]) {
  const languages = new Map<string, ReturnType<typeof emptyBreakdownRow>>();
  const platforms = new Map<string, ReturnType<typeof emptyBreakdownRow>>();
  const sources = new Map<string, ReturnType<typeof emptyBreakdownRow> & { startParamValues: Set<string> }>();

  events.forEach((event) => {
    const languageKey = event.languageCode ?? "unknown";
    const platformKey = event.platform ?? "unknown";
    const sourceKey = event.source ?? "unknown";
    if (!languages.has(languageKey)) languages.set(languageKey, emptyBreakdownRow("languageCode", languageKey));
    if (!platforms.has(platformKey)) platforms.set(platformKey, emptyBreakdownRow("platform", platformKey));
    if (!sources.has(sourceKey)) {
      sources.set(sourceKey, { ...emptyBreakdownRow("source", sourceKey), startParamValues: new Set<string>() });
    }
    addBreakdownEvent(languages.get(languageKey)!, event);
    addBreakdownEvent(platforms.get(platformKey)!, event);
    const sourceRow = sources.get(sourceKey)!;
    if (event.startParam) sourceRow.startParamValues.add(event.startParam);
    addBreakdownEvent(sourceRow, event);
  });

  return {
    languages: Array.from(languages.values())
      .map((row) => ({ languageCode: String(row.languageCode), ...serializeBreakdownRow(row) }))
      .sort((a, b) => b.users - a.users),
    platforms: Array.from(platforms.values())
      .map((row) => ({ platform: String(row.platform), ...serializeBreakdownRow(row) }))
      .sort((a, b) => b.users - a.users),
    sources: Array.from(sources.values())
      .map((row) => ({
        source: String(row.source),
        startParam: Array.from(row.startParamValues)[0] ?? String(row.source),
        ...serializeBreakdownRow(row)
      }))
      .sort((a, b) => b.users - a.users)
  };
}

export async function getAdminAnalyticsBreakdowns(input: { period: AnalyticsPeriod }) {
  return breakdownsFromEvents(await loadAnalyticsEvents(input.period));
}

export async function getAdminAnalyticsEvents(input: { period: AnalyticsPeriod; limit: number }) {
  const events = await loadAnalyticsEvents(input.period, input.limit);
  return { events };
}

export async function getAdminAnalyticsSummary(input: { period: AnalyticsPeriod }) {
  const from = periodFrom(input.period);
  const to = new Date();
  const events = await loadAnalyticsEvents(input.period);
  const counts = eventCounts(events);
  const eventUserIds = Array.from(new Set(events.map((event) => event.userId).filter((id): id is string => Boolean(id))));
  const users = await prisma.user.findMany({
    where: eventUserIds.length > 0
      ? { id: { in: eventUserIds } }
      : from
        ? { createdAt: { gte: from } }
        : undefined,
    select: { id: true, accessUntil: true, lifetimeAccess: true, pets: { select: { id: true }, take: 1 } }
  });
  const userIds = users.map((user) => user.id);
  const [usersWithEntries, payments] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve(0)
      : Promise.all([
          prisma.feedingEntry.findMany({ where: { userId: { in: userIds } }, select: { userId: true } }),
          prisma.symptomEntry.findMany({ where: { userId: { in: userIds } }, select: { userId: true } }),
          prisma.medicineEntry.findMany({ where: { userId: { in: userIds } }, select: { userId: true } }),
          prisma.weightEntry.findMany({ where: { userId: { in: userIds } }, select: { userId: true } }),
          prisma.noteEntry.findMany({ where: { userId: { in: userIds } }, select: { userId: true } })
        ]).then((groups) => new Set(groups.flat().map((entry) => entry.userId)).size),
    prisma.payment.findMany({
      where: {
        status: "PAID",
        ...(from ? { paidAt: { gte: from } } : {})
      },
      select: { userId: true, amountStars: true }
    })
  ]);
  const activePaidUsers = users.filter((user) => user.lifetimeAccess || (user.accessUntil && user.accessUntil > to)).length;

  const funnel = funnelEvents.map((item, index) => {
    const count = uniqueUsersFor(events, item.key).size;
    const previous = index === 0 ? null : uniqueUsersFor(events, funnelEvents[index - 1].key).size;
    return {
      key: item.key,
      label: item.label,
      count,
      conversionFromPrevious: conversion(count, previous)
    };
  });

  const dayRows = new Map<string, Record<string, number | string>>();
  events.forEach((event) => {
    if (!funnelEvents.some((item) => item.key === event.event)) return;
    const key = dayKey(event.createdAt);
    const row = dayRows.get(key) ?? { date: key };
    row[event.event] = Number(row[event.event] ?? 0) + 1;
    dayRows.set(key, row);
  });

  return {
    period: input.period,
    from,
    to,
    totals: {
      users: users.length,
      usersWithPets: users.filter((user) => user.pets.length > 0).length,
      usersWithEntries,
      activePaidUsers,
      paymentsCount: payments.length,
      paymentsStars: payments.reduce((sum, payment) => sum + payment.amountStars, 0)
    },
    funnel,
    eventsByDay: Array.from(dayRows.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
    topEvents: Array.from(counts.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    breakdowns: breakdownsFromEvents(events)
  };
}
