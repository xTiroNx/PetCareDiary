DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Payment"
    WHERE "telegramPaymentChargeId" IS NOT NULL
    GROUP BY "telegramPaymentChargeId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create Payment_telegramPaymentChargeId_key: duplicate non-null telegramPaymentChargeId values exist. Resolve duplicates before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "Payment_telegramPaymentChargeId_key" ON "Payment"("telegramPaymentChargeId");
