import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { trackAnalyticsEvent } from "./analytics.service.js";
import { sendPaymentReceiptNotification } from "./reminderScheduler.service.js";
import { HttpError } from "../utils/httpError.js";

export type CheckoutProductType = "MONTHLY" | "SIX_MONTHS" | "YEARLY" | "ADMIN_TEST_DAY";

const checkoutProducts: Record<CheckoutProductType, { priceStars: number; durationDays: number; title: string; description: string }> = {
  MONTHLY: {
    priceStars: env.MONTHLY_PRICE_STARS,
    durationDays: 30,
    title: "PetCare Diary: 1 month access",
    description: "30 days of Pro access to AI, voice commands, reminders, reports and photo uploads."
  },
  SIX_MONTHS: {
    priceStars: env.SIX_MONTHS_PRICE_STARS,
    durationDays: 180,
    title: "PetCare Diary: 6 months access",
    description: "180 days of Pro access to AI, voice commands, reminders, reports and photo uploads."
  },
  YEARLY: {
    priceStars: env.YEARLY_PRICE_STARS,
    durationDays: 365,
    title: "PetCare Diary: 1 year access",
    description: "365 days of Pro access to AI, voice commands, reminders, reports and photo uploads."
  },
  ADMIN_TEST_DAY: {
    priceStars: 1,
    durationDays: 1,
    title: "PetCare Diary: admin payment test",
    description: "Admin-only payment test with 1 day of Pro access."
  }
};

function checkoutProduct(productType: string) {
  const product = checkoutProducts[productType as CheckoutProductType];
  if (!product) {
    throw new HttpError(400, "PAYMENT_PRODUCT_UNAVAILABLE", "Payment product is not available for checkout.");
  }
  return product;
}

function accessDurationDays(productType: string) {
  if (productType === "MONTHLY") return 30;
  if (productType === "SIX_MONTHS") return 180;
  if (productType === "YEARLY") return 365;
  if (productType === "ADMIN_TEST_DAY") return 1;
  return null;
}

export async function createStarsInvoice(userId: string, productType: CheckoutProductType, options: { isAdmin?: boolean } = {}) {
  if (productType === "ADMIN_TEST_DAY" && !options.isAdmin) {
    throw new HttpError(403, "ADMIN_PAYMENT_PRODUCT_FORBIDDEN", "Admin payment product is available only to administrators.");
  }
  const product = checkoutProduct(productType);
  const amountStars = product.priceStars;
  const invoicePayload = `petcare:${productType.toLowerCase()}:${userId}:${nanoid(16)}`;

  const payment = await prisma.payment.create({
    data: {
      userId,
      productType,
      amountStars,
      currency: "XTR",
      status: "PENDING",
      invoicePayload
    }
  });

  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: product.title,
      description: product.description,
      payload: invoicePayload,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: product.title, amount: amountStars }]
    })
  });

  const data = (await response.json()) as { ok: boolean; result?: string; description?: string };
  if (!response.ok || !data.ok || !data.result) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    throw new HttpError(502, "TELEGRAM_INVOICE_FAILED", data.description ?? "Telegram invoice creation failed.");
  }

  return { payment, invoiceLink: data.result };
}

export async function answerPreCheckoutQuery(preCheckoutQueryId: string, ok = true, errorMessage?: string) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerPreCheckoutQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      error_message: errorMessage
    })
  });

  if (!response.ok) {
    console.error("Failed to answer pre_checkout_query", await response.text());
  }
}

export async function validatePreCheckoutQuery(query: {
  id: string;
  from: { id: number };
  invoice_payload: string;
  currency: string;
  total_amount: number;
}) {
  const payment = await prisma.payment.findUnique({
    where: { invoicePayload: query.invoice_payload }
  });

  if (!payment) {
    await answerPreCheckoutQuery(query.id, false, "Payment payload was not found.");
    throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment payload not found.");
  }

  if (payment.userId) {
    const owner = await prisma.user.findUnique({ where: { id: payment.userId }, select: { telegramId: true } });
    if (!owner || owner.telegramId !== BigInt(query.from.id)) {
      await answerPreCheckoutQuery(query.id, false, "Payment belongs to another Telegram user.");
      throw new HttpError(400, "PAYMENT_USER_MISMATCH", "Payment belongs to another Telegram user.");
    }
  }

  if (payment.status !== "PENDING") {
    await answerPreCheckoutQuery(query.id, false, "Payment is not pending.");
    throw new HttpError(400, "PAYMENT_NOT_PENDING", "Payment is not pending.");
  }

  if (payment.currency !== query.currency || payment.amountStars !== query.total_amount) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    await answerPreCheckoutQuery(query.id, false, "Payment amount or currency mismatch.");
    throw new HttpError(400, "PAYMENT_AMOUNT_MISMATCH", "Payment amount or currency mismatch.");
  }

  await answerPreCheckoutQuery(query.id, true);
}

export async function grantAccessForSuccessfulPayment(paymentUpdate: {
  payerTelegramId?: number;
  invoice_payload: string;
  currency: string;
  total_amount: number;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}) {
  const payment = await prisma.payment.findUnique({
    where: { invoicePayload: paymentUpdate.invoice_payload },
    include: { user: true }
  });
  if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment payload not found.");
  if (payment.status === "PAID") {
    if (
      payment.currency === paymentUpdate.currency &&
      payment.amountStars === paymentUpdate.total_amount &&
      payment.telegramPaymentChargeId === paymentUpdate.telegram_payment_charge_id &&
      (!paymentUpdate.payerTelegramId || payment.user.telegramId === BigInt(paymentUpdate.payerTelegramId))
    ) {
      return payment;
    }
    throw new HttpError(409, "PAYMENT_ALREADY_PAID", "Payment payload is already paid by another transaction.");
  }
  if (payment.status !== "PENDING") throw new HttpError(400, "PAYMENT_NOT_PENDING", "Payment is not pending.");
  if (paymentUpdate.payerTelegramId && payment.user.telegramId !== BigInt(paymentUpdate.payerTelegramId)) {
    throw new HttpError(400, "PAYMENT_USER_MISMATCH", "Payment belongs to another Telegram user.");
  }
  if (!paymentUpdate.payerTelegramId) {
    console.warn("Successful payment update is missing message.from.id; falling back to invoice payload owner.", {
      paymentId: payment.id,
      invoicePayload: payment.invoicePayload,
      telegramPaymentChargeId: paymentUpdate.telegram_payment_charge_id
    });
  }
  if (payment.currency !== paymentUpdate.currency || payment.amountStars !== paymentUpdate.total_amount) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    throw new HttpError(400, "PAYMENT_AMOUNT_MISMATCH", "Payment amount or currency mismatch.");
  }

  const now = new Date();
  const paidPayment = await prisma.$transaction(async (tx) => {
    const duplicateCharge = await tx.payment.findFirst({
      where: {
        telegramPaymentChargeId: paymentUpdate.telegram_payment_charge_id,
        NOT: { id: payment.id }
      }
    });
    if (duplicateCharge) {
      throw new HttpError(409, "PAYMENT_CHARGE_ALREADY_USED", "Telegram payment charge id was already used.");
    }

    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: now,
        telegramPaymentChargeId: paymentUpdate.telegram_payment_charge_id,
        providerPaymentChargeId: paymentUpdate.provider_payment_charge_id
      }
    });

    if (claimed.count === 0) {
      const existing = await tx.payment.findUnique({ where: { id: payment.id } });
      if (existing?.status === "PAID") return existing;
      throw new HttpError(400, "PAYMENT_NOT_PENDING", "Payment is not pending.");
    }

    const freshUser = await tx.user.findUniqueOrThrow({ where: { id: payment.userId } });
    const durationDays = accessDurationDays(payment.productType);
    const userUpdate = durationDays
      ? {
          accessUntil: new Date(
            Math.max(freshUser.accessUntil?.getTime() ?? 0, now.getTime()) + durationDays * 24 * 60 * 60 * 1000
          )
        }
      : { lifetimeAccess: true };
    await tx.user.update({ where: { id: payment.userId }, data: userUpdate });
    return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
  });

  await trackAnalyticsEvent({
    userId: payment.userId,
    telegramId: payment.user.telegramId,
    event: "payment_success",
    metadata: {
      paymentId: paidPayment.id,
      productType: payment.productType,
      amountStars: payment.amountStars,
      currency: payment.currency
    }
  });
  void sendPaymentReceiptNotification(paidPayment.id);

  return paidPayment;
}
