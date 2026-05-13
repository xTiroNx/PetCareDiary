import { Router } from "express";
import { z } from "zod";
import { analyticsEvents, normalizeSource, trackAnalyticsEvent } from "../services/analytics.service.js";

const router = Router();

const metadataSchema = z.record(z.unknown()).refine((value) => JSON.stringify(value).length <= 4000, {
  message: "Metadata is too large."
});

const analyticsEventSchema = z.object({
  event: z.enum(analyticsEvents),
  languageCode: z.string().trim().min(1).max(16).optional().nullable(),
  platform: z.string().trim().min(1).max(32).optional().nullable(),
  startParam: z.string().trim().min(1).max(128).optional().nullable(),
  source: z.string().trim().min(1).max(128).optional().nullable(),
  metadata: metadataSchema.optional().nullable()
}).strict();

router.post("/event", async (req, res, next) => {
  try {
    const body = analyticsEventSchema.parse(req.body);
    await trackAnalyticsEvent({
      userId: req.user!.id,
      telegramId: req.user!.telegramId,
      event: body.event,
      languageCode: body.languageCode,
      platform: body.platform,
      startParam: body.startParam,
      source: body.source ?? normalizeSource(body.startParam),
      metadata: body.metadata
    });
    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
