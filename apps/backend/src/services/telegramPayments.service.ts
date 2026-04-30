import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { HttpError } from "../utils/httpError.js";

type ProductType = "MONTHLY" | "LIFETIME";

function priceFor(productType: ProductType) {
  return productType === "MONTHLY" ? env.MONTHLY_PRICE_STARS : env.LIFETIME_PRICE_STARS;
}

function titleFor(productType: ProductType) {
  return productType === "MONTHLY" ? "PetCare Diary: 30 days access" : "PetCare Diary: lifetime access";
}

export async function createStarsInvoice(userId: string, productType: ProductType) {
  const amountStars = priceFor(productType);
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
      title: titleFor(productType),
      description:
        productType === "MONTHLY"
          ? "30 days of access to feeding, symptoms, medicines, weight and reports."
          : "Lifetime access to PetCare Diary.",
      payload: invoicePayload,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: titleFor(productType), amount: amountStars }]
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
  if (payment.status === "PAID") return payment;
  if (payment.status !== "PENDING") throw new HttpError(400, "PAYMENT_NOT_PENDING", "Payment is not pending.");
  if (payment.currency !== paymentUpdate.currency || payment.amountStars !== paymentUpdate.total_amount) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    throw new HttpError(400, "PAYMENT_AMOUNT_MISMATCH", "Payment amount or currency mismatch.");
  }

  const now = new Date();
  const paidPayment = await prisma.$transaction(async (tx) => {
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
    const userUpdate =
      payment.productType === "LIFETIME"
        ? { lifetimeAccess: true }
        : {
            accessUntil: new Date(
              Math.max(freshUser.accessUntil?.getTime() ?? 0, now.getTime()) + 30 * 24 * 60 * 60 * 1000
            )
          };
    await tx.user.update({ where: { id: payment.userId }, data: userUpdate });
    return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
  });

  return paidPayment;
}
