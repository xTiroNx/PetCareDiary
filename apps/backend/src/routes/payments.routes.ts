import { Router } from "express";
import { z } from "zod";
import { createStarsInvoice } from "../services/telegramPayments.service.js";
import { serialize } from "../utils/serialize.js";

const router = Router();

router.post("/create-invoice", async (req, res, next) => {
  try {
    const { productType } = z.object({ productType: z.enum(["MONTHLY", "LIFETIME"]) }).strict().parse(req.body);
    const result = await createStarsInvoice(req.user!.id, productType);
    res.status(201).json(serialize({
      paymentId: result.payment.id,
      invoicePayload: result.payment.invoicePayload,
      invoiceLink: result.invoiceLink,
      productType: result.payment.productType,
      amountStars: result.payment.amountStars,
      currency: result.payment.currency
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
