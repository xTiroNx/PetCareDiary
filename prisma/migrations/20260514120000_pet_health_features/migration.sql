ALTER TYPE "ReminderType" ADD VALUE IF NOT EXISTS 'VACCINATION';

CREATE TYPE "VaccinationProcedureType" AS ENUM ('VACCINE', 'DEWORMING', 'FLEA_TICK', 'OTHER');

CREATE TYPE "AccessNotificationType" AS ENUM ('TRIAL_ENDING_SOON', 'PAID_ENDING_SOON', 'ACCESS_EXPIRED', 'PAYMENT_RECEIPT');

CREATE TABLE "WaterEntry" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaccinationEntry" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "procedureType" "VaccinationProcedureType" NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaccinationEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessNotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccessNotificationType" NOT NULL,
    "dayKey" TEXT,
    "relatedPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaterEntry_userId_petId_dateTime_idx" ON "WaterEntry"("userId", "petId", "dateTime");

CREATE INDEX "VaccinationEntry_userId_petId_date_idx" ON "VaccinationEntry"("userId", "petId", "date");
CREATE INDEX "VaccinationEntry_userId_petId_nextDueDate_idx" ON "VaccinationEntry"("userId", "petId", "nextDueDate");

CREATE INDEX "AccessNotificationLog_userId_createdAt_idx" ON "AccessNotificationLog"("userId", "createdAt");
CREATE INDEX "AccessNotificationLog_type_createdAt_idx" ON "AccessNotificationLog"("type", "createdAt");
CREATE UNIQUE INDEX "AccessNotificationLog_userId_type_dayKey_key" ON "AccessNotificationLog"("userId", "type", "dayKey");
CREATE UNIQUE INDEX "AccessNotificationLog_userId_type_relatedPaymentId_key" ON "AccessNotificationLog"("userId", "type", "relatedPaymentId");

ALTER TABLE "WaterEntry" ADD CONSTRAINT "WaterEntry_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaterEntry" ADD CONSTRAINT "WaterEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VaccinationEntry" ADD CONSTRAINT "VaccinationEntry_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaccinationEntry" ADD CONSTRAINT "VaccinationEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccessNotificationLog" ADD CONSTRAINT "AccessNotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
