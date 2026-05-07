import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const transcriptionResponseSchema = z.object({
  text: z.string().min(1)
}).passthrough();

export type AudioFormat = "webm" | "m4a" | "mp3" | "wav";

export async function transcribeAudioWithOpenRouter(input: {
  audio: Buffer;
  format: AudioFormat;
  language?: string;
}) {
  if (!env.OPENROUTER_API_KEY) {
    throw new HttpError(502, "VOICE_TRANSCRIPTION_FAILED", "OpenRouter API key is not configured.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      input_audio: {
        data: input.audio.toString("base64"),
        format: input.format
      },
      model: env.OPENROUTER_STT_MODEL,
      ...(input.language ? { language: input.language } : {})
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(502, "VOICE_TRANSCRIPTION_FAILED", "Voice transcription provider failed.");
  }

  const parsed = transcriptionResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new HttpError(502, "VOICE_TRANSCRIPTION_FAILED", "Voice transcription provider returned an invalid response.");
  }

  return parsed.data.text.trim();
}
