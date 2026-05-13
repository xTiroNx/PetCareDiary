import { trackAnalyticsEvent } from "../api/analytics";
import { getTelegramWebApp } from "./telegram";

export type AnalyticsEventName =
  | "app_opened"
  | "onboarding_started"
  | "pet_create_clicked"
  | "voice_clicked"
  | "report_preview_opened"
  | "paywall_opened"
  | "invoice_opened";

const maxMetadataKeys = 12;
const maxStringLength = 120;

export function normalizeSource(startParam: string | null | undefined) {
  const value = startParam?.trim();
  if (!value) return "direct";
  if (value.startsWith("aff_")) return value;
  return value;
}

export function getTelegramAnalyticsContext() {
  const tg = getTelegramWebApp();
  const languageCode = tg?.initDataUnsafe?.user?.language_code ?? null;
  const platform = tg?.platform ?? null;
  const startParam = tg?.initDataUnsafe?.start_param ?? null;
  const source = normalizeSource(startParam);

  return { languageCode, platform, startParam, source };
}

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).slice(0, maxMetadataKeys).map(([key, value]) => {
      if (typeof value === "string") return [key, value.slice(0, maxStringLength)];
      if (typeof value === "number" || typeof value === "boolean" || value === null) return [key, value];
      return [key, String(value).slice(0, maxStringLength)];
    })
  );
}

export function trackEvent(event: AnalyticsEventName, metadata?: Record<string, unknown>) {
  const context = getTelegramAnalyticsContext();
  void trackAnalyticsEvent({
    event,
    ...context,
    metadata: sanitizeMetadata(metadata)
  }).catch(() => {
    // Analytics must never affect product UX.
  });
}
