import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { grantAccessForSuccessfulPayment, validatePreCheckoutQuery } from "../services/telegramPayments.service.js";
import { HttpError } from "../utils/httpError.js";

const router = Router();
const telegramUserRefSchema = z.object({
  id: z.number().int().positive()
}).passthrough();

const telegramPaymentSchema = z.object({
  invoice_payload: z.string().min(1).max(512),
  currency: z.literal("XTR"),
  total_amount: z.number().int().positive(),
  telegram_payment_charge_id: z.string().min(1).max(256),
  provider_payment_charge_id: z.string().max(256).default("")
}).passthrough();

const telegramUpdateSchema = z.object({
  pre_checkout_query: z.object({
    id: z.string().min(1).max(256),
    from: telegramUserRefSchema,
    invoice_payload: z.string().min(1).max(512),
    currency: z.literal("XTR"),
    total_amount: z.number().int().positive()
  }).passthrough().optional(),
  message: z.object({
    from: telegramUserRefSchema.optional(),
    successful_payment: telegramPaymentSchema.optional()
  }).passthrough().optional()
}).passthrough();

router.post("/webhook", async (req, res, next) => {
  try {
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = req.header("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        throw new HttpError(401, "TELEGRAM_WEBHOOK_UNAUTHORIZED", "Telegram webhook secret is invalid.");
      }
    }

    const update = telegramUpdateSchema.parse(req.body);

    if (update.pre_checkout_query) {
      await validatePreCheckoutQuery(update.pre_checkout_query);
      return res.json({ ok: true });
    }

    const successfulPayment = update.message?.successful_payment;
    if (successfulPayment) {
      await grantAccessForSuccessfulPayment({ ...successfulPayment, payerTelegramId: update.message?.from?.id });
      return res.json({ ok: true });
    }

    return res.json({ ok: true, ignored: true });
  } catch (error) {
    next(error);
  }
});

export default router;
