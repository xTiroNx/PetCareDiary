import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { requireActiveAccess } from "./middlewares/access.middleware.js";
import { requireAdmin } from "./middlewares/admin.middleware.js";
import { errorMiddleware, notFoundMiddleware } from "./middlewares/error.middleware.js";
import { rateLimit } from "./middlewares/rateLimit.middleware.js";
import adminRoutes from "./routes/admin.routes.js";
import adminAnalyticsRoutes from "./routes/adminAnalytics.routes.js";
import adminVoiceRoutes from "./routes/adminVoice.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import attachmentsRoutes from "./routes/attachments.routes.js";
import authRoutes from "./routes/auth.routes.js";
import diaryRoutes from "./routes/diary.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import petsRoutes from "./routes/pets.routes.js";
import remindersRoutes from "./routes/reminders.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import telegramRoutes from "./routes/telegram.routes.js";
import vaccinationsRoutes from "./routes/vaccinations.routes.js";
import voiceRoutes from "./routes/voice.routes.js";
import waterRoutes from "./routes/water.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", rateLimit({ keyPrefix: "auth", windowMs: 60_000, max: 30 }), authRoutes);
  app.use("/api/telegram", telegramRoutes);
  app.use("/api/admin/voice", authMiddleware, requireAdmin, rateLimit({ keyPrefix: "admin-voice", windowMs: 60_000, max: 20 }), adminVoiceRoutes);
  app.use("/api/admin/analytics", authMiddleware, requireAdmin, rateLimit({ keyPrefix: "admin-analytics", windowMs: 60_000, max: 120 }), adminAnalyticsRoutes);
  app.use("/api/admin/attachments", authMiddleware, requireAdmin, rateLimit({ keyPrefix: "admin-attachments", windowMs: 60_000, max: 60 }), attachmentsRoutes);
  app.use("/api/admin", authMiddleware, requireAdmin, rateLimit({ keyPrefix: "admin", windowMs: 60_000, max: 120 }), adminRoutes);
  app.use("/api/analytics", authMiddleware, rateLimit({ keyPrefix: "analytics", windowMs: 60_000, max: 120 }), analyticsRoutes);
  app.use("/api/payments", authMiddleware, rateLimit({ keyPrefix: "payments", windowMs: 60_000, max: 20 }), paymentsRoutes);
  app.use("/api/feedback", authMiddleware, rateLimit({ keyPrefix: "feedback", windowMs: 10 * 60_000, max: 5 }), feedbackRoutes);
  app.use("/api/voice", authMiddleware, requireActiveAccess, rateLimit({ keyPrefix: "user-voice", windowMs: 60_000, max: 10 }), voiceRoutes);
  app.use("/api/ai", authMiddleware, requireActiveAccess, rateLimit({ keyPrefix: "ai-assistant", windowMs: 60_000, max: 10 }), aiRoutes);
  app.use("/api/attachments", authMiddleware, rateLimit({ keyPrefix: "attachments", windowMs: 60_000, max: 60 }), attachmentsRoutes);
  app.use("/api/pets", authMiddleware, petsRoutes);
  app.use("/api/reminders", authMiddleware, remindersRoutes);
  app.use("/api/vaccinations", authMiddleware, vaccinationsRoutes);
  app.use("/api/water", authMiddleware, waterRoutes);
  app.use("/api/reports", authMiddleware, rateLimit({ keyPrefix: "reports", windowMs: 60_000, max: 60 }), reportsRoutes);
  app.use("/api", authMiddleware, diaryRoutes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
