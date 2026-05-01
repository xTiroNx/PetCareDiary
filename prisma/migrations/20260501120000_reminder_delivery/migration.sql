ALTER TABLE "Reminder" ADD COLUMN "lastSentAt" TIMESTAMP(3);
ALTER TABLE "Reminder" ADD COLUMN "lastDeliveryError" TEXT;
