-- Add nullable acquisition fields; safe for existing users.
ALTER TABLE "User" ADD COLUMN "platform" TEXT;
ALTER TABLE "User" ADD COLUMN "firstStartParam" TEXT;
ALTER TABLE "User" ADD COLUMN "lastStartParam" TEXT;
ALTER TABLE "User" ADD COLUMN "source" TEXT;
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "telegramId" BIGINT,
    "event" TEXT NOT NULL,
    "languageCode" TEXT,
    "platform" TEXT,
    "startParam" TEXT,
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AnalyticsEvent_event_createdAt_idx" ON "AnalyticsEvent"("event", "createdAt");
CREATE INDEX "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");
CREATE INDEX "AnalyticsEvent_telegramId_createdAt_idx" ON "AnalyticsEvent"("telegramId", "createdAt");
CREATE INDEX "AnalyticsEvent_languageCode_createdAt_idx" ON "AnalyticsEvent"("languageCode", "createdAt");
CREATE INDEX "AnalyticsEvent_platform_createdAt_idx" ON "AnalyticsEvent"("platform", "createdAt");
CREATE INDEX "AnalyticsEvent_startParam_createdAt_idx" ON "AnalyticsEvent"("startParam", "createdAt");
CREATE INDEX "AnalyticsEvent_source_createdAt_idx" ON "AnalyticsEvent"("source", "createdAt");
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");
