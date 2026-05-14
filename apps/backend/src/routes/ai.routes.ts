import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { trackAnalyticsEvent } from "../services/analytics.service.js";
import { HttpError } from "../utils/httpError.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";

const router = Router();

const assistantModes = ["SUMMARY", "VET_QUESTIONS", "WHAT_TO_TRACK", "GENERAL_HELP"] as const;

const assistantBodySchema = z.object({
  petId: z.string().min(1).max(128),
  mode: z.enum(assistantModes),
  question: z.string().trim().max(1000).optional().nullable(),
  period: z.coerce.number().int().refine((value) => [7, 14, 30, 90].includes(value)),
  timezone: z.string().min(1).max(80),
  locale: z.string().min(2).max(16).optional().nullable()
}).strict();

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function assertDailyLimit(userId: string) {
  const usedToday = await prisma.analyticsEvent.count({
    where: {
      userId,
      event: "ai_assistant_used",
      createdAt: { gte: startOfUtcDay() }
    }
  });
  if (usedToday >= env.AI_ASSISTANT_DAILY_LIMIT_PER_USER) {
    throw new HttpError(429, "AI_ASSISTANT_LIMIT_REACHED", "Daily AI assistant limit reached.");
  }
}

function safeTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new HttpError(400, "INVALID_TIMEZONE", "Invalid IANA timezone.");
  }
}

function responseLanguage(locale?: string | null) {
  const value = (locale ?? "en").toLowerCase();
  if (value.startsWith("ru")) return "Russian";
  if (value.startsWith("es")) return "Spanish";
  if (value.startsWith("fr")) return "French";
  if (value.startsWith("de")) return "German";
  if (value.startsWith("zh")) return "Chinese";
  return "English";
}

function disclaimerFor(locale?: string | null) {
  const value = (locale ?? "en").toLowerCase();
  if (value.startsWith("ru")) return "AI-помощник не заменяет ветеринара, не ставит диагнозы и не назначает лечение.";
  if (value.startsWith("es")) return "El asistente de IA no reemplaza al veterinario, no diagnostica ni prescribe tratamiento.";
  if (value.startsWith("fr")) return "L'assistant IA ne remplace pas un veterinaire, ne diagnostique pas et ne prescrit pas de traitement.";
  if (value.startsWith("de")) return "Der KI-Assistent ersetzt keinen Tierarzt, stellt keine Diagnosen und verschreibt keine Behandlung.";
  if (value.startsWith("zh")) return "AI 助手不能替代兽医，不做诊断，也不提供治疗处方。";
  return "The AI assistant does not replace a veterinarian, diagnose, or prescribe treatment.";
}

function dateFormatter(locale: string | undefined | null, timezone: string) {
  return new Intl.DateTimeFormat(locale || "en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function loadAssistantData(input: {
  userId: string;
  petId: string;
  period: number;
  timezone: string;
  locale?: string | null;
}) {
  const from = new Date(Date.now() - input.period * 24 * 60 * 60 * 1000);
  const format = dateFormatter(input.locale, input.timezone);
  const [pet, feeding, symptoms, medicines, weights, notes, water, vaccinations] = await Promise.all([
    prisma.pet.findFirst({
      where: { id: input.petId, userId: input.userId },
      select: { name: true, type: true, weightKg: true, ageYears: true, healthNotes: true }
    }),
    prisma.feedingEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "asc" },
      take: 200,
      select: { dateTime: true, foodType: true, amount: true, note: true }
    }),
    prisma.symptomEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "asc" },
      take: 200,
      select: { dateTime: true, symptomType: true, severity: true, note: true }
    }),
    prisma.medicineEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "asc" },
      take: 200,
      select: { dateTime: true, medicineName: true, dosage: true, taken: true, note: true }
    }),
    prisma.weightEntry.findMany({
      where: { userId: input.userId, petId: input.petId, date: { gte: from } },
      orderBy: { date: "asc" },
      take: 200,
      select: { date: true, weightKg: true }
    }),
    prisma.noteEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "asc" },
      take: 200,
      select: { dateTime: true, note: true }
    }),
    prisma.waterEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "asc" },
      take: 200,
      select: { dateTime: true, amountMl: true, note: true }
    }),
    prisma.vaccinationEntry.findMany({
      where: { userId: input.userId, petId: input.petId, date: { gte: from } },
      orderBy: { date: "asc" },
      take: 200,
      select: { date: true, procedureType: true, title: true, nextDueDate: true, note: true }
    })
  ]);

  return {
    pet: {
      name: pet?.name,
      type: pet?.type,
      currentWeightKg: pet?.weightKg?.toString(),
      ageYears: pet?.ageYears?.toString(),
      healthNotes: pet?.healthNotes
    },
    periodDays: input.period,
    timezone: input.timezone,
    entries: {
      feeding: feeding.map((entry) => ({ ...entry, localTime: format.format(entry.dateTime) })),
      symptoms: symptoms.map((entry) => ({ ...entry, localTime: format.format(entry.dateTime) })),
      medicines: medicines.map((entry) => ({ ...entry, localTime: format.format(entry.dateTime) })),
      weights: weights.map((entry) => ({ date: entry.date, localDate: format.format(entry.date), weightKg: entry.weightKg.toString() })),
      notes: notes.map((entry) => ({ ...entry, localTime: format.format(entry.dateTime) })),
      water: water.map((entry) => ({ ...entry, localTime: format.format(entry.dateTime) })),
      vaccinations: vaccinations.map((entry) => ({
        ...entry,
        localDate: format.format(entry.date),
        nextDueLocalDate: entry.nextDueDate ? format.format(entry.nextDueDate) : null
      }))
    }
  };
}

async function askMiniMax(input: {
  mode: typeof assistantModes[number];
  question?: string | null;
  locale?: string | null;
  data: Awaited<ReturnType<typeof loadAssistantData>>;
}) {
  if (!env.MINIMAX_API_KEY) throw new HttpError(503, "AI_ASSISTANT_UNAVAILABLE", "AI assistant provider is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.MINIMAX_AI_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.MINIMAX_API_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.MINIMAX_REPORT_MODEL ?? env.MINIMAX_PARSER_MODEL,
        messages: [
          {
            role: "system",
            content: [
              "You are a cautious pet diary assistant.",
              "Never diagnose. Never prescribe treatment. Never change medication, dosage, or stop medication.",
              "You may summarize diary records, suggest questions to ask a veterinarian, suggest what data to track next, and recommend contacting a veterinarian for severe, recurring, or worsening symptoms.",
              "Use careful language and make it clear that this does not replace veterinary care.",
              `Answer in ${responseLanguage(input.locale)}.`,
              "Return plain text only."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              mode: input.mode,
              question: input.question,
              reportData: input.data
            })
          }
        ],
        temperature: 0.2,
        max_completion_tokens: 700
      })
    });
    const data = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = data?.choices?.[0]?.message?.content;
    if (!response.ok || typeof content !== "string" || !content.trim()) {
      throw new HttpError(502, "AI_ASSISTANT_FAILED", "AI assistant provider failed.");
    }
    return content.trim().slice(0, 4000);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.warn(JSON.stringify({ event: "ai_assistant_failed", error: error instanceof Error ? error.name : "unknown" }));
    throw new HttpError(502, "AI_ASSISTANT_FAILED", "AI assistant provider failed.");
  } finally {
    clearTimeout(timeout);
  }
}

router.post("/assistant", async (req, res, next) => {
  try {
    const body = assistantBodySchema.parse(req.body);
    const timezone = safeTimezone(body.timezone);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    await assertDailyLimit(req.user!.id);
    const data = await loadAssistantData({
      userId: req.user!.id,
      petId: body.petId,
      period: body.period,
      timezone,
      locale: body.locale ?? req.user!.languageCode
    });
    const answer = await askMiniMax({
      mode: body.mode,
      question: body.question,
      locale: body.locale ?? req.user!.languageCode,
      data
    });
    await trackAnalyticsEvent({
      userId: req.user!.id,
      event: "ai_assistant_used",
      metadata: { petId: body.petId, mode: body.mode, period: body.period }
    });
    res.json({
      answer,
      disclaimer: disclaimerFor(body.locale ?? req.user!.languageCode),
      usedPeriod: body.period,
      warnings: []
    });
  } catch (error) {
    next(error);
  }
});

export default router;
