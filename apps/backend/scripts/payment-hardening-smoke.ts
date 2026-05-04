process.env.NODE_ENV ??= "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";

if (process.env.NODE_ENV === "production" && process.env.PAYMENT_SMOKE_ALLOW_PRODUCTION !== "true") {
  throw new Error("Refusing to run payment hardening smoke against production without PAYMENT_SMOKE_ALLOW_PRODUCTION=true.");
}

const [{ prisma }, { grantAccessForSuccessfulPayment }, { HttpError }] = await Promise.all([
  import("../src/prisma/client.js"),
  import("../src/services/telegramPayments.service.js"),
  import("../src/utils/httpError.js")
]);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function expectHttpError(code: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    if (error instanceof HttpError && error.code === code) return;
    throw error;
  }
  throw new Error(`Expected ${code}.`);
}

const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const idSuffix = Date.now() % 1_000_000_000;
const ownerTelegramId = BigInt(7_700_000_000 + idSuffix);
const otherTelegramId = BigInt(8_800_000_000 + idSuffix);
const now = new Date();
const trialEndsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

try {
  await prisma.user.deleteMany({ where: { telegramId: { in: [ownerTelegramId, otherTelegramId] } } });

  const [owner, other] = await Promise.all([
    prisma.user.create({
      data: {
        telegramId: ownerTelegramId,
        firstName: "PaymentSmokeOwner",
        trialStartedAt: now,
        trialEndsAt
      }
    }),
    prisma.user.create({
      data: {
        telegramId: otherTelegramId,
        firstName: "PaymentSmokeOther",
        trialStartedAt: now,
        trialEndsAt
      }
    })
  ]);

  const payment = await prisma.payment.create({
    data: {
      userId: owner.id,
      productType: "MONTHLY",
      amountStars: 199,
      currency: "XTR",
      status: "PENDING",
      invoicePayload: `payment-smoke:${suffix}:owner`
    }
  });

  await expectHttpError("PAYMENT_USER_MISMATCH", () => grantAccessForSuccessfulPayment({
    payerTelegramId: Number(other.telegramId),
    invoice_payload: payment.invoicePayload,
    currency: "XTR",
    total_amount: 199,
    telegram_payment_charge_id: `charge:${suffix}:owner`,
    provider_payment_charge_id: ""
  }));

  const paid = await grantAccessForSuccessfulPayment({
    payerTelegramId: Number(owner.telegramId),
    invoice_payload: payment.invoicePayload,
    currency: "XTR",
    total_amount: 199,
    telegram_payment_charge_id: `charge:${suffix}:owner`,
    provider_payment_charge_id: ""
  });
  assert(paid.status === "PAID", "Expected owner payment to be marked PAID.");

  const ownerAfterPayment = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
  const accessUntilAfterPayment = ownerAfterPayment.accessUntil?.getTime();
  assert(accessUntilAfterPayment, "Expected monthly access to be granted.");

  await grantAccessForSuccessfulPayment({
    payerTelegramId: Number(owner.telegramId),
    invoice_payload: payment.invoicePayload,
    currency: "XTR",
    total_amount: 199,
    telegram_payment_charge_id: `charge:${suffix}:owner`,
    provider_payment_charge_id: ""
  });
  const ownerAfterReplay = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
  assert(ownerAfterReplay.accessUntil?.getTime() === accessUntilAfterPayment, "Expected duplicate webhook replay not to extend access twice.");

  const secondPayment = await prisma.payment.create({
    data: {
      userId: owner.id,
      productType: "MONTHLY",
      amountStars: 199,
      currency: "XTR",
      status: "PENDING",
      invoicePayload: `payment-smoke:${suffix}:duplicate-charge`
    }
  });

  await expectHttpError("PAYMENT_CHARGE_ALREADY_USED", () => grantAccessForSuccessfulPayment({
    payerTelegramId: Number(owner.telegramId),
    invoice_payload: secondPayment.invoicePayload,
    currency: "XTR",
    total_amount: 199,
    telegram_payment_charge_id: `charge:${suffix}:owner`,
    provider_payment_charge_id: ""
  }));

  console.log("Payment hardening smoke checks passed.");
} finally {
  await prisma.user.deleteMany({ where: { telegramId: { in: [ownerTelegramId, otherTelegramId] } } });
  await prisma.$disconnect();
}
