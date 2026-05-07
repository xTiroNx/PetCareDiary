import crypto from "node:crypto";
import { Router, type NextFunction, type Response } from "express";
import type { Request } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { transcribeAudioWithOpenRouter, type AudioFormat } from "../services/openRouterTranscription.service.js";
import { parseVoiceCommandWithMinimax } from "../services/minimaxVoiceCommandParser.service.js";
import { HttpError } from "../utils/httpError.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";
import { serialize } from "../utils/serialize.js";

const router = Router();
const allowedMimeTypes: Record<string, AudioFormat> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav"
};
const dailyLimitBuckets = new Map<string, { dayKey: string; count: number }>();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: Math.ceil(env.VOICE_AUDIO_MAX_MB * 1024 * 1024)
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes[file.mimetype]) {
      return cb(new HttpError(400, "VOICE_AUDIO_UNSUPPORTED", "Unsupported audio mimetype."));
    }
    return cb(null, true);
  }
});

const voiceBodySchema = z.object({
  petId: z.string().min(1).max(128),
  clientNow: z.string().datetime(),
  timezone: z.string().min(1).max(80),
  locale: z.enum(["ru", "en", "es", "fr", "de", "zh"]).optional()
}).strict();

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function assertTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid timezone.");
  }
}

function consumeDailyLimit(userId: string) {
  const today = dayKey();
  const bucket = dailyLimitBuckets.get(userId);
  if (!bucket || bucket.dayKey !== today) {
    dailyLimitBuckets.set(userId, { dayKey: today, count: 1 });
    return;
  }
  if (bucket.count >= env.VOICE_DAILY_LIMIT_PER_USER) {
    throw new HttpError(429, "VOICE_LIMIT_REACHED", "Daily voice command limit reached.");
  }
  bucket.count += 1;
}

function multerAudio(req: Request) {
  const file = req.file;
  if (!file) throw new HttpError(400, "VOICE_AUDIO_REQUIRED", "Audio file is required.");
  const format = allowedMimeTypes[file.mimetype];
  if (!format) throw new HttpError(400, "VOICE_AUDIO_UNSUPPORTED", "Unsupported audio mimetype.");
  return { file, format };
}

function normalizeUploadError(error: unknown) {
  if (error instanceof HttpError) return error;
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new HttpError(413, "VOICE_AUDIO_TOO_LARGE", "Voice audio is too large.");
    }
    return new HttpError(400, "VOICE_UPLOAD_INVALID", "Voice upload is invalid.");
  }
  return error;
}

function requireVoiceCommandsEnabled(_req: Request, _res: Response, next: NextFunction) {
  if (!env.VOICE_COMMANDS_ENABLED) {
    return next(new HttpError(403, "VOICE_COMMANDS_DISABLED", "Voice commands are disabled."));
  }
  return next();
}

function uploadAudio(req: Request, res: Response, next: NextFunction) {
  upload.single("audio")(req, res, (error) => {
    if (error) return next(normalizeUploadError(error));
    return next();
  });
}

router.post("/command", requireVoiceCommandsEnabled, uploadAudio, async (req, res, next) => {
  const requestId = crypto.randomUUID();
  let status = "failed";
  let errorCode: string | undefined;

  try {
    const body = voiceBodySchema.parse(req.body);
    assertTimeZone(body.timezone);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const { file, format } = multerAudio(req);

    consumeDailyLimit(req.user!.id);

    const transcript = await transcribeAudioWithOpenRouter({
      audio: file.buffer,
      format,
      language: body.locale
    });
    const parsed = await parseVoiceCommandWithMinimax({
      transcript,
      clientNow: body.clientNow,
      timezone: body.timezone,
      locale: body.locale
    });

    status = "ok";
    res.json(serialize({
      transcript,
      intent: parsed.intent,
      confidence: parsed.confidence,
      needsConfirmation: true,
      draft: parsed.draft,
      warnings: parsed.warnings
    }));
  } catch (error) {
    const normalizedError = normalizeUploadError(error);
    errorCode = normalizedError instanceof HttpError ? normalizedError.code : "INTERNAL_SERVER_ERROR";
    next(normalizedError);
  } finally {
    const log = {
      event: "admin_voice_command",
      requestId,
      userId: req.user?.id,
      status,
      errorCode
    };
    if (env.NODE_ENV === "production") console.info(JSON.stringify(log));
    else console.info(JSON.stringify(log));
  }
});

export default router;
