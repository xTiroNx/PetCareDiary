CREATE TABLE "Feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "page" TEXT,
  "accessStatus" TEXT NOT NULL,
  "telegramSentAt" TIMESTAMP(3),
  "telegramDeliveryError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
