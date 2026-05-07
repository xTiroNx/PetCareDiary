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
  REMINDER_SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),
  MONTHLY_PRICE_STARS: z.coerce.number().int().positive().default(199),
  LIFETIME_PRICE_STARS: z.coerce.number().int().positive().default(1499),
  TRIAL_DAYS: z.coerce.number().int().positive().default(3),
  VOICE_COMMANDS_ENABLED: z.coerce.boolean().default(false),
  VOICE_AUDIO_MAX_MB: z.coerce.number().positive().max(25).default(5),
  VOICE_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().default(20),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_STT_MODEL: z.string().min(1).default("openai/gpt-4o-mini-transcribe"),
  MINIMAX_API_KEY: z.string().min(1).optional(),
  MINIMAX_PARSER_MODEL: z.string().min(1).default("MiniMax-M2.7"),
  MINIMAX_API_BASE_URL: z.string().url().default("https://api.minimax.io"),
  ENABLE_DEV_AUTH: z.coerce.boolean().default(false),
  DEV_TELEGRAM_ID: z.coerce.number().int().positive().default(777000001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && !value.TELEGRAM_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TELEGRAM_WEBHOOK_SECRET"],
      message: "TELEGRAM_WEBHOOK_SECRET is required in production."
    });
  }
  if (value.VOICE_COMMANDS_ENABLED && !value.OPENROUTER_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENROUTER_API_KEY"],
      message: "OPENROUTER_API_KEY is required when VOICE_COMMANDS_ENABLED=true."
    });
  }
  if (value.VOICE_COMMANDS_ENABLED && !value.MINIMAX_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MINIMAX_API_KEY"],
      message: "MINIMAX_API_KEY is required when VOICE_COMMANDS_ENABLED=true."
    });
  }
});

export const env = envSchema.parse(process.env);
export const backendPort = env.PORT ?? env.BACKEND_PORT;
