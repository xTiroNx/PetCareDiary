import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().optional(),
  BACKEND_PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  BOT_USERNAME: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  ADMIN_TELEGRAM_IDS: z.string().default(""),
  MONTHLY_PRICE_STARS: z.coerce.number().int().positive().default(199),
  LIFETIME_PRICE_STARS: z.coerce.number().int().positive().default(1499),
  TRIAL_DAYS: z.coerce.number().int().positive().default(3),
  ENABLE_DEV_AUTH: z.coerce.boolean().default(false),
  DEV_TELEGRAM_ID: z.coerce.number().int().positive().default(777000001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export const env = envSchema.parse(process.env);
export const backendPort = env.PORT ?? env.BACKEND_PORT;
