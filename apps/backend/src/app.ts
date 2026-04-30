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
import authRoutes from "./routes/auth.routes.js";
import diaryRoutes from "./routes/diary.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import petsRoutes from "./routes/pets.routes.js";
import remindersRoutes from "./routes/reminders.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import telegramRoutes from "./routes/telegram.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", rateLimit({ keyPrefix: "auth", windowMs: 60_000, max: 30 }), authRoutes);
  app.use("/api/telegram", telegramRoutes);
  app.use("/api/admin", authMiddleware, requireAdmin, rateLimit({ keyPrefix: "admin", windowMs: 60_000, max: 120 }), adminRoutes);
  app.use("/api/payments", authMiddleware, rateLimit({ keyPrefix: "payments", windowMs: 60_000, max: 20 }), paymentsRoutes);
  app.use("/api/pets", authMiddleware, requireActiveAccess, petsRoutes);
  app.use("/api", authMiddleware, requireActiveAccess, diaryRoutes);
  app.use("/api/reminders", authMiddleware, requireActiveAccess, remindersRoutes);
  app.use("/api/reports", authMiddleware, requireActiveAccess, rateLimit({ keyPrefix: "reports", windowMs: 60_000, max: 60 }), reportsRoutes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
