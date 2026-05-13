import { Router } from "express";
import { z } from "zod";
import { getAdminAnalyticsEvents, getAdminAnalyticsSummary } from "../services/analytics.service.js";
import { serialize } from "../utils/serialize.js";

const router = Router();

const periodSchema = z.enum(["7d", "30d", "90d", "all"]).default("30d");
const summaryQuerySchema = z.object({
  period: periodSchema
}).strict();
const eventsQuerySchema = z.object({
  period: periodSchema,
  limit: z.coerce.number().int().min(1).max(500).default(100)
}).strict();

router.get("/summary", async (req, res, next) => {
  try {
    const query = summaryQuerySchema.parse(req.query);
    const summary = await getAdminAnalyticsSummary({ period: query.period });
    res.json(serialize(summary));
  } catch (error) {
    next(error);
  }
});

router.get("/events", async (req, res, next) => {
  try {
    const query = eventsQuerySchema.parse(req.query);
    const events = await getAdminAnalyticsEvents({ period: query.period, limit: query.limit });
    res.json(serialize(events));
  } catch (error) {
    next(error);
  }
});

export default router;
