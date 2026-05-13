import { api, jsonBody } from "./client";

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export type AnalyticsFunnelStep = {
  key: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
};

export type AnalyticsDailyRow = {
  date: string;
  app_opened?: number;
  pet_created?: number;
  first_entry_created?: number;
  paywall_opened?: number;
  payment_success?: number;
};

export type AnalyticsLanguageBreakdown = {
  languageCode: string | null;
  users: number;
  appOpened?: number;
  petCreated: number;
  firstEntryCreated: number;
  paywallOpened: number;
  invoiceOpened: number;
  paymentSuccess: number;
  petConversion: number;
  firstEntryConversion?: number;
  paymentConversion: number;
};

export type AnalyticsPlatformBreakdown = {
  platform: string | null;
  users: number;
  petCreated: number;
  firstEntryCreated: number;
  paymentSuccess: number;
  petConversion: number;
};

export type AnalyticsSourceBreakdown = {
  source: string | null;
  startParam: string | null;
  users: number;
  petCreated: number;
  firstEntryCreated: number;
  paywallOpened: number;
  invoiceOpened: number;
  paymentSuccess: number;
  petConversion: number;
  paymentConversion: number;
};

export type AnalyticsBreakdowns = {
  languages: AnalyticsLanguageBreakdown[];
  platforms: AnalyticsPlatformBreakdown[];
  sources: AnalyticsSourceBreakdown[];
};

export type AnalyticsSummary = {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  totals: {
    users: number;
    usersWithPets: number;
    usersWithEntries: number;
    activePaidUsers: number;
    paymentsCount: number;
    paymentsStars: number;
  };
  funnel: AnalyticsFunnelStep[];
  eventsByDay: AnalyticsDailyRow[];
  topEvents: Array<{ event: string; count: number }>;
  breakdowns: AnalyticsBreakdowns;
};

export type AnalyticsEvent = {
  createdAt: string;
  event: string;
  userId?: string | null;
  telegramId?: string | null;
  languageCode?: string | null;
  platform?: string | null;
  startParam?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AnalyticsEventsResponse = {
  events: AnalyticsEvent[];
};

export type AnalyticsEventPayload = {
  event: string;
  languageCode: string | null;
  platform: string | null;
  startParam: string | null;
  source: string;
  metadata?: Record<string, unknown>;
};

export function trackAnalyticsEvent(payload: AnalyticsEventPayload) {
  return api<{ ok?: boolean }>("/api/analytics/event", {
    method: "POST",
    body: jsonBody(payload)
  });
}

export function getAdminAnalyticsSummary(period: AnalyticsPeriod) {
  const params = new URLSearchParams({ period });
  return api<AnalyticsSummary>(`/api/admin/analytics/summary?${params}`);
}

export function getAdminAnalyticsEvents(period: AnalyticsPeriod, limit = 100) {
  const params = new URLSearchParams({ period, limit: String(limit) });
  return api<AnalyticsEventsResponse>(`/api/admin/analytics/events?${params}`);
}
