ALTER TABLE "User" ADD COLUMN "reactivationTrialGrantedAt" TIMESTAMP(3);

UPDATE "User"
SET "reactivationTrialGrantedAt" = CURRENT_TIMESTAMP
WHERE "lifetimeAccess" = TRUE
   OR "accessUntil" > CURRENT_TIMESTAMP
   OR "trialEndsAt" > CURRENT_TIMESTAMP;
