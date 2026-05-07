import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const intentSchema = z.enum(["create_reminder", "create_medicine_entry", "create_note", "unknown"]);

const reminderDraftSchema = z.object({
  type: z.enum(["FEEDING", "MEDICINE", "WEIGHT", "VET", "OTHER"]),
  title: z.string().min(1).max(160),
  time: z.string().datetime(),
  repeatRule: z.enum(["daily", "weekly", "monthly"]).nullable()
}).strict();

const medicineDraftSchema = z.object({
  medicineName: z.string().min(1).max(120),
  dosage: z.string().max(80),
  taken: z.boolean(),
  dateTime: z.string().datetime(),
  note: z.string().max(1000).nullable()
}).strict();

const noteDraftSchema = z.object({
  dateTime: z.string().datetime(),
  note: z.string().min(1).max(2000)
}).strict();

const unknownDraftSchema = z.object({}).strict();

const parsedCommandSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create_reminder"),
    confidence: z.number().min(0).max(1),
    draft: reminderDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("create_medicine_entry"),
    confidence: z.number().min(0).max(1),
    draft: medicineDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("create_note"),
    confidence: z.number().min(0).max(1),
    draft: noteDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("unknown"),
    confidence: z.number().min(0).max(1),
    draft: unknownDraftSchema.default({}),
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict()
]);

const minimaxResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string()
    }).passthrough()
  }).passthrough()).min(1)
}).passthrough();

export type ParsedVoiceCommand = z.infer<typeof parsedCommandSchema>;

function stripThinking(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseJsonContent(content: string) {
  const cleaned = stripThinking(content);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new HttpError(422, "VOICE_PARSE_FAILED", "Voice command parser returned invalid JSON.");
  }
}

function parserSystemPrompt() {
  return [
    "You parse short PetCare Diary voice command transcripts into strict JSON only.",
    "Do not give medical advice. Do not invent medicine dosage if the user did not say it.",
    "Always return needsConfirmation outside this parser is true, so do not create database records.",
    "Supported intents: create_reminder, create_medicine_entry, create_note, unknown.",
    "For create_reminder draft: type FEEDING/MEDICINE/WEIGHT/VET/OTHER, title, time ISO string, repeatRule null/daily/weekly/monthly.",
    "For create_medicine_entry draft: medicineName, dosage, taken, dateTime ISO string, note null or string.",
    "For create_note draft: dateTime ISO string, note.",
    "Rules:",
    "- If user says a medicine was given/taken, use create_medicine_entry with taken=true.",
    "- If medicine command has no time, use clientNow.",
    "- If reminder has no date, choose the nearest future time relative to clientNow in the provided timezone.",
    "- If reminder time is ambiguous, add warning or return unknown.",
    "- Preserve user-provided comments in note fields.",
    "- For unknown or unsafe medical advice requests, return intent unknown.",
    "Return exactly this JSON shape with no Markdown:",
    "{\"intent\":\"create_reminder|create_medicine_entry|create_note|unknown\",\"confidence\":0.0,\"draft\":{},\"warnings\":[]}"
  ].join("\n");
}

export async function parseVoiceCommandWithMinimax(input: {
  transcript: string;
  clientNow: string;
  timezone: string;
  locale?: string;
}) {
  if (!env.MINIMAX_API_KEY) {
    throw new HttpError(422, "VOICE_PARSE_FAILED", "MiniMax API key is not configured.");
  }

  const response = await fetch(`${env.MINIMAX_API_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.MINIMAX_PARSER_MODEL,
      messages: [
        { role: "system", content: parserSystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            transcript: input.transcript,
            clientNow: input.clientNow,
            timezone: input.timezone,
            locale: input.locale ?? null
          })
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_completion_tokens: 700
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(422, "VOICE_PARSE_FAILED", "Voice command parser provider failed.");
  }

  const parsedResponse = minimaxResponseSchema.safeParse(data);
  if (!parsedResponse.success) {
    throw new HttpError(422, "VOICE_PARSE_FAILED", "Voice command parser returned an invalid response.");
  }

  const json = parseJsonContent(parsedResponse.data.choices[0].message.content);
  const parsedCommand = parsedCommandSchema.safeParse(json);
  if (!parsedCommand.success) {
    throw new HttpError(422, "VOICE_PARSE_FAILED", "Voice command parser returned an invalid command draft.");
  }

  return parsedCommand.data;
}
