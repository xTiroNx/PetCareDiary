process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.MONTHLY_PRICE_STARS = "149";
process.env.SIX_MONTHS_PRICE_STARS = "699";
process.env.YEARLY_PRICE_STARS = "1199";

const [{ prisma }, { createStarsInvoice, grantAccessForSuccessfulPayment }, { HttpError }] = await Promise.all([
  import("../src/prisma/client.js"),
  import("../src/services/telegramPayments.service.js"),
  import("../src/utils/httpError.js")
]);

type ProductType = "MONTHLY" | "SIX_MONTHS" | "YEARLY" | "ADMIN_TEST_DAY";

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

const createdPayments = new Map<string, Record<string, unknown>>();
const invoiceRequests: Array<{ payload: string; amount: number }> = [];

(prisma.payment.create as unknown as (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>) = async ({ data }) => {
  const payment = { id: `payment-${createdPayments.size + 1}`, ...data };
  createdPayments.set(String(data.invoicePayload), payment);
  return payment;
};

globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as { payload: string; prices: Array<{ amount: number }> };
  invoiceRequests.push({ payload: body.payload, amount: body.prices[0].amount });
  return new Response(JSON.stringify({ ok: true, result: `https://t.me/invoice/${body.payload}` }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

async function assertInvoice(productType: ProductType, amountStars: number, isAdmin = false) {
  const result = await createStarsInvoice("user-products-smoke", productType, { isAdmin });
  assert(result.payment.productType === productType, `Expected ${productType} payment product type.`);
  assert(result.payment.amountStars === amountStars, `Expected ${productType} amount ${amountStars}.`);
  const request = invoiceRequests.find((item) => item.payload === result.payment.invoicePayload);
  assert(request?.amount === amountStars, `Expected ${productType} invoice request amount ${amountStars}.`);
}

await assertInvoice("MONTHLY", 149);
await assertInvoice("SIX_MONTHS", 699);
await assertInvoice("YEARLY", 1199);
await expectHttpError("ADMIN_PAYMENT_PRODUCT_FORBIDDEN", () => createStarsInvoice("user-products-smoke", "ADMIN_TEST_DAY"));
await assertInvoice("ADMIN_TEST_DAY", 1, true);
await expectHttpError("PAYMENT_PRODUCT_UNAVAILABLE", () => createStarsInvoice("user-products-smoke", "LIFETIME" as ProductType));

async function assertGrantDuration(productType: ProductType, amountStars: number, durationDays: number) {
  const activeUntil = new Date("2030-01-01T00:00:00.000Z");
  const user = {
    id: `user-${productType}`,
    telegramId: 777000001n,
    accessUntil: activeUntil,
    lifetimeAccess: false
  };
  const payment = {
    id: `paid-${productType}`,
    userId: user.id,
    user,
    productType,
    amountStars,
    currency: "XTR",
    status: "PENDING",
    invoicePayload: `payload-${productType}`,
    telegramPaymentChargeId: null
  };
  let updatedAccessUntil: Date | undefined;

  (prisma.payment.findUnique as unknown as (args: { where: { invoicePayload?: string; id?: string } }) => Promise<unknown>) = async ({ where }) => {
    if (where.invoicePayload === payment.invoicePayload || where.id === payment.id) return payment;
    return null;
  };
  (prisma.$transaction as unknown as (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) = async (callback) => callback({
    payment: {
      findFirst: async () => null,
      updateMany: async () => {
        payment.status = "PAID";
        return { count: 1 };
      },
      findUnique: async () => payment,
      findUniqueOrThrow: async () => payment
    },
    user: {
      findUniqueOrThrow: async () => user,
      update: async ({ data }: { data: { accessUntil?: Date } }) => {
        updatedAccessUntil = data.accessUntil;
        return { ...user, ...data };
      }
    }
  });

  await grantAccessForSuccessfulPayment({
    payerTelegramId: Number(user.telegramId),
    invoice_payload: payment.invoicePayload,
    currency: "XTR",
    total_amount: amountStars,
    telegram_payment_charge_id: `charge-${productType}`,
    provider_payment_charge_id: ""
  });

  assert(updatedAccessUntil?.getTime() === activeUntil.getTime() + durationDays * 24 * 60 * 60 * 1000, `Expected ${productType} to extend by ${durationDays} days from active accessUntil.`);
}

await assertGrantDuration("MONTHLY", 149, 30);
await assertGrantDuration("SIX_MONTHS", 699, 180);
await assertGrantDuration("YEARLY", 1199, 365);
await assertGrantDuration("ADMIN_TEST_DAY", 1, 1);

console.log("Payment product smoke checks passed.");
