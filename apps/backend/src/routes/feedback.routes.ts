import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { sendFeedbackNotification } from "../services/feedbackNotification.service.js";
import { getAccessStatus } from "../utils/access.js";
import { serialize } from "../utils/serialize.js";

const router = Router();

const feedbackSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  page: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? undefined : value,
    z.string().trim().min(1).max(200).optional()
  )
}).strict();

router.post("/", async (req, res, next) => {
  const user = req.user!;
  const accessStatus = getAccessStatus(user);

  try {
    const body = feedbackSchema.parse(req.body);
    const feedback = await prisma.feedback.create({
      data: {
        userId: user.id,
        message: body.message,
        page: body.page,
        accessStatus
      }
    });

    try {
      const delivery = await sendFeedbackNotification({
        feedbackId: feedback.id,
        user,
        accessStatus,
        page: body.page,
        message: body.message
      });

      await prisma.feedback.update({
        where: { id: feedback.id },
        data: {
          telegramSentAt: new Date(),
          telegramDeliveryError: delivery.failed > 0 ? delivery.errors.join("; ").slice(0, 500) : null
        }
      });

      console.info(JSON.stringify({
        event: "feedback_submitted",
        feedbackId: feedback.id,
        userId: user.id,
        accessStatus,
        status: delivery.failed > 0 ? "partial_delivery" : "delivered"
      }));
    } catch (deliveryError) {
      const message = deliveryError instanceof Error ? deliveryError.message : "Feedback delivery failed.";
      await prisma.feedback.update({
        where: { id: feedback.id },
        data: { telegramDeliveryError: message.slice(0, 500) }
      });
      console.warn(JSON.stringify({
        event: "feedback_delivery_failed",
        feedbackId: feedback.id,
        userId: user.id,
        accessStatus,
        status: "delivery_failed",
        errorCode: deliveryError && typeof deliveryError === "object" && "code" in deliveryError ? deliveryError.code : "FEEDBACK_DELIVERY_FAILED"
      }));
    }

    res.status(201).json(serialize({ id: feedback.id, ok: true }));
  } catch (error) {
    next(error);
  }
});

export default router;
