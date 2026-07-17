import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional()
);
const optionalUrl = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().url().optional()
);
const fileStorageDriver = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.enum(["local", "r2"]).default("local")
);

const envSchema = z.object({
  PORT: z.coerce.number().optional(),
  BACKEND_PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  BOT_USERNAME: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  ADMIN_TELEGRAM_IDS: z.string().default(""),
  FEEDBACK_TELEGRAM_IDS: z.string().default(""),
  REMINDER_SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),
  MONTHLY_PRICE_STARS: z.coerce.number().int().positive().default(149),
  SIX_MONTHS_PRICE_STARS: z.coerce.number().int().positive().default(699),
  YEARLY_PRICE_STARS: z.coerce.number().int().positive().default(1199),
  TRIAL_DAYS: z.coerce.number().int().positive().default(7),
  VOICE_COMMANDS_ENABLED: z.coerce.boolean().default(false),
  VOICE_AUDIO_MAX_MB: z.coerce.number().positive().max(25).default(5),
  VOICE_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().default(20),
  VOICE_ADMIN_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().optional(),
  VOICE_USER_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().optional(),
  VOICE_PARSER_DEBUG_LOGS: z.coerce.boolean().default(false),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_STT_MODEL: z.string().min(1).default("openai/gpt-4o-mini-transcribe"),
  OPENROUTER_STT_PARSER: z.string().min(1).optional(),
  OPENROUTER_STT_MODEL_PARSER: z.string().min(1).default("google/gemini-3.1-flash-lite"),
  OPENROUTER_STT_MODEL_PARSER_FALLBACK: z.string().min(1).default("minimax/minimax-m3"),
  OPENROUTER_API_KEY_AI_HELPER: z.string().min(1).optional(),
  OPENROUTER_AI_HELPER_MODEL: z.string().min(1).default("google/gemini-3.1-flash-lite"),
  OPENROUTER_AI_HELPER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(50_000),
  MINIMAX_API_KEY: z.string().min(1).optional(),
  MINIMAX_PARSER_MODEL: z.string().min(1).default("MiniMax-M2.7"),
  MINIMAX_REPORT_MODEL: z.string().min(1).optional(),
  MINIMAX_REPORT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(4_000),
  MINIMAX_AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(50_000),
  MINIMAX_API_BASE_URL: z.string().url().default("https://api.minimax.io"),
  AI_ASSISTANT_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().default(10),
  AI_ASSISTANT_IMAGE_LIMIT: z.coerce.number().int().min(0).max(5).default(3),
  FILE_STORAGE_DRIVER: fileStorageDriver,
  ATTACHMENTS_LOCAL_DIR: z.string().min(1).default("/tmp/petcare-attachments"),
  ATTACHMENTS_MAX_FILE_MB: z.coerce.number().positive().max(20).default(5),
  ATTACHMENTS_MAX_PER_ENTRY: z.coerce.number().int().min(1).max(10).default(3),
  FILE_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  R2_ACCOUNT_ID: optionalNonEmptyString,
  R2_BUCKET: optionalNonEmptyString,
  R2_ACCESS_KEY_ID: optionalNonEmptyString,
  R2_SECRET_ACCESS_KEY: optionalNonEmptyString,
  R2_ENDPOINT: optionalUrl,
  R2_REGION: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).default("auto")),
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
  if (value.VOICE_COMMANDS_ENABLED && !value.OPENROUTER_STT_PARSER && !value.MINIMAX_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENROUTER_STT_PARSER"],
      message: "OPENROUTER_STT_PARSER or MINIMAX_API_KEY is required when VOICE_COMMANDS_ENABLED=true."
    });
  }
  if (value.FILE_STORAGE_DRIVER === "r2") {
    if (!value.R2_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["R2_BUCKET"],
        message: "R2_BUCKET is required when FILE_STORAGE_DRIVER=r2."
      });
    }
    if (!value.R2_ACCESS_KEY_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["R2_ACCESS_KEY_ID"],
        message: "R2_ACCESS_KEY_ID is required when FILE_STORAGE_DRIVER=r2."
      });
    }
    if (!value.R2_SECRET_ACCESS_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["R2_SECRET_ACCESS_KEY"],
        message: "R2_SECRET_ACCESS_KEY is required when FILE_STORAGE_DRIVER=r2."
      });
    }
    if (!value.R2_ENDPOINT && !value.R2_ACCOUNT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["R2_ACCOUNT_ID"],
        message: "R2_ACCOUNT_ID or R2_ENDPOINT is required when FILE_STORAGE_DRIVER=r2."
      });
    }
  }
});

export const env = envSchema.parse(process.env);
export const backendPort = env.PORT ?? env.BACKEND_PORT;
