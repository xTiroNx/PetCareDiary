import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { canUseDirectAttachmentStorage, createAttachmentDownloadUrl } from "../services/attachments.service.js";
import { trackAnalyticsEvent } from "../services/analytics.service.js";
import { sanitizeAiFinalAnswer } from "../utils/aiResponseSanitizer.js";
import { HttpError } from "../utils/httpError.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";

const router = Router();

const assistantModes = ["VET_QUESTIONS", "GENERAL_HELP"] as const;
const assistantHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000)
}).strict();

const assistantBodySchema = z.object({
  petId: z.string().min(1).max(128),
  mode: z.enum(assistantModes),
  question: z.string().trim().max(1000).optional().nullable(),
  period: z.coerce.number().int().refine((value) => [7, 14, 30, 90].includes(value)),
  timezone: z.string().min(1).max(80),
  locale: z.string().min(2).max(16).optional().nullable(),
  includeImages: z.coerce.boolean().default(false),
  imageAttachmentIds: z.array(z.string().min(1).max(128)).max(3).default([]),
  history: z.array(assistantHistoryMessageSchema).max(6).default([])
}).strict();

const assistantPhotosQuerySchema = z.object({
  petId: z.string().min(1).max(128),
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

function warningFor(locale: string | undefined | null, code: "imagesNoR2" | "imagesNone" | "imagesPrepareFailed") {
  const value = (locale ?? "en").toLowerCase();
  if (value.startsWith("ru")) {
    if (code === "imagesNoR2") return "Фото не были отправлены в AI: анализ изображений доступен только при R2-хранилище.";
    if (code === "imagesNone") return "Фото за выбранный период не найдены.";
    return "Не удалось подготовить фото для AI. Ответ построен только по текстовым записям.";
  }
  if (value.startsWith("es")) {
    if (code === "imagesNoR2") return "Las fotos no se enviaron a la IA: el análisis de imágenes requiere almacenamiento R2.";
    if (code === "imagesNone") return "No se encontraron fotos para el periodo seleccionado.";
    return "No se pudieron preparar las fotos para la IA. La respuesta usa solo registros de texto.";
  }
  if (value.startsWith("fr")) {
    if (code === "imagesNoR2") return "Les photos n'ont pas été envoyées à l'IA : l'analyse d'images nécessite le stockage R2.";
    if (code === "imagesNone") return "Aucune photo trouvée pour la période sélectionnée.";
    return "Impossible de préparer les photos pour l'IA. La réponse utilise seulement les notes texte.";
  }
  if (value.startsWith("de")) {
    if (code === "imagesNoR2") return "Fotos wurden nicht an die KI gesendet: Bildanalyse benötigt R2-Speicher.";
    if (code === "imagesNone") return "Für den ausgewählten Zeitraum wurden keine Fotos gefunden.";
    return "Fotos konnten nicht für die KI vorbereitet werden. Die Antwort nutzt nur Texteinträge.";
  }
  if (value.startsWith("zh")) {
    if (code === "imagesNoR2") return "照片未发送给 AI：图片分析需要 R2 存储。";
    if (code === "imagesNone") return "所选周期内没有找到照片。";
    return "无法为 AI 准备照片。回答仅基于文字记录。";
  }
  if (code === "imagesNoR2") return "Photos were not sent to AI: image analysis requires R2 storage.";
  if (code === "imagesNone") return "No photos were found for the selected period.";
  return "Could not prepare photos for AI. The answer uses text records only.";
}

function modeInstruction(mode: typeof assistantModes[number]) {
  if (mode === "VET_QUESTIONS") {
    return [
      "Prepare a practical, calm set of topics and questions the owner can discuss with a veterinarian.",
      "Base the questions only on the diary records for the selected period.",
      "Start with one short sentence about what seems worth discussing, then list focused questions.",
      "Include questions about patterns in feeding, symptoms, medicines, water intake, weight, vaccinations or recent treatments when the diary data makes them relevant.",
      "If there is little data, say that briefly and ask questions that help clarify what the owner should observe next.",
      "Use a friendly, practical tone. Prefer 5-8 concise bullets, but do not be so terse that the questions lose context."
    ].join("\n");
  }
  return [
    "Answer the user's free-form question cautiously, warmly, and practically.",
    "Use the pet diary records for context when they are relevant.",
    "If the diary does not contain enough information, say that clearly and suggest what to check or record next.",
    "Do not invent facts that are not in the diary.",
    "Use a clear mobile-friendly structure. Prefer 4-7 short sections or bullets. Be practical, but not overly terse.",
    "When useful, structure the answer like this:",
    "1. Brief takeaway.",
    "2. What the diary shows.",
    "3. Possible everyday explanations or hypotheses, only if they are safe, obvious, and framed as possibilities rather than conclusions.",
    "4. What the owner can check at home without changing treatment, medication, dosage, or diet in a risky way.",
    "5. What to record next in the diary.",
    "6. Red flags for urgent veterinary care.",
    "7. Questions to ask the veterinarian.",
    "Avoid panic and avoid long medical textbook paragraphs."
  ].join("\n");
}

type AssistantCategory = "feeding" | "symptoms" | "medicines" | "weights" | "notes" | "water" | "vaccinations";

const categoryKeywords: Record<AssistantCategory, RegExp> = {
  feeding: /(корм|ед|аппетит|food|feed|eat|meal|comida|comer|repas|mang|futter|essen|喂|吃|粮)/i,
  symptoms: /(симптом|рвот|понос|боль|вял|аппетит|symptom|vomit|diarr|pain|letharg|v[oó]mit|dolor|douleur|schmerz|呕吐|腹泻|疼)/i,
  medicines: /(лекар|таблет|доз|medicine|medication|dose|medicina|m[eé]dicament|medikament|药|剂量)/i,
  weights: /(вес|взвес|weight|weigh|peso|poids|gewicht|体重)/i,
  notes: /(замет|запис|note|nota|notiz|备注|笔记)/i,
  water: /(вод|пить|water|drink|agua|boire|wasser|trinken|水|喝)/i,
  vaccinations: /(вакцин|привив|обработ|глист|блох|клещ|vaccin|deworm|flea|tick|vacuna|vermifuge|impfung|entwurm|疫苗|驱虫)/i
};

function relevantCategories(question?: string | null) {
  const text = question?.trim() ?? "";
  return new Set(
    (Object.entries(categoryKeywords) as Array<[AssistantCategory, RegExp]>)
      .filter(([, pattern]) => pattern.test(text))
      .map(([category]) => category)
  );
}

function selectRelevantRecords<T>(records: T[], category: AssistantCategory, relevant: Set<AssistantCategory>) {
  const limit = relevant.size === 0 ? 25 : relevant.has(category) ? 80 : 10;
  return records.slice(-limit);
}

function localDayKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function buildAssistantSummary(input: {
  timezone: string;
  feeding: Array<{ dateTime: Date }>;
  symptoms: Array<{ dateTime: Date; symptomType: string }>;
  medicines: Array<{ dateTime: Date; taken: boolean }>;
  weights: Array<{ date: Date; weightKg: { toString(): string } }>;
  notes: Array<{ dateTime: Date }>;
  water: Array<{ dateTime: Date; amountMl: number }>;
  vaccinations: Array<{ date: Date }>;
}) {
  type DailySummary = {
    date: string;
    feedings: number;
    symptoms: number;
    medicines: number;
    medicinesTaken: number;
    waterMl: number;
    notes: number;
    vaccinations: number;
    weightKg?: number;
  };
  const daily = new Map<string, DailySummary>();
  const row = (date: Date) => {
    const key = localDayKey(date, input.timezone);
    const existing = daily.get(key) ?? {
      date: key,
      feedings: 0,
      symptoms: 0,
      medicines: 0,
      medicinesTaken: 0,
      waterMl: 0,
      notes: 0,
      vaccinations: 0
    };
    daily.set(key, existing);
    return existing;
  };

  input.feeding.forEach((entry) => { row(entry.dateTime).feedings += 1; });
  input.symptoms.forEach((entry) => { row(entry.dateTime).symptoms += 1; });
  input.medicines.forEach((entry) => {
    const day = row(entry.dateTime);
    day.medicines += 1;
    if (entry.taken) day.medicinesTaken += 1;
  });
  input.weights.forEach((entry) => { row(entry.date).weightKg = Number(entry.weightKg.toString()); });
  input.notes.forEach((entry) => { row(entry.dateTime).notes += 1; });
  input.water.forEach((entry) => { row(entry.dateTime).waterMl += entry.amountMl; });
  input.vaccinations.forEach((entry) => { row(entry.date).vaccinations += 1; });

  const symptomFrequency = input.symptoms.reduce<Record<string, number>>((result, entry) => {
    result[entry.symptomType] = (result[entry.symptomType] ?? 0) + 1;
    return result;
  }, {});
  const weightValues = input.weights.map((entry) => Number(entry.weightKg.toString())).filter(Number.isFinite);
  const firstWeight = weightValues[0];
  const lastWeight = weightValues.at(-1);

  return {
    totals: {
      feeding: input.feeding.length,
      symptoms: input.symptoms.length,
      medicines: input.medicines.length,
      weights: input.weights.length,
      notes: input.notes.length,
      water: input.water.length,
      vaccinations: input.vaccinations.length
    },
    symptomFrequency,
    weightTrend: firstWeight !== undefined && lastWeight !== undefined ? {
      firstKg: firstWeight,
      lastKg: lastWeight,
      changeKg: Number((lastWeight - firstWeight).toFixed(3)),
      minKg: Math.min(...weightValues),
      maxKg: Math.max(...weightValues)
    } : null,
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date))
  };
}

async function loadAssistantData(input: {
  userId: string;
  petId: string;
  period: number;
  timezone: string;
  locale?: string | null;
  includeImages?: boolean;
  imageAttachmentIds?: string[];
  imageLimit?: number;
  question?: string | null;
}) {
  const from = new Date(Date.now() - input.period * 24 * 60 * 60 * 1000);
  const format = dateFormatter(input.locale, input.timezone);
  const [pet, feedingNewest, symptomsNewest, medicinesNewest, weightsNewest, notesNewest, waterNewest, vaccinationsNewest] = await Promise.all([
    prisma.pet.findFirst({
      where: { id: input.petId, userId: input.userId },
      select: { name: true, type: true, weightKg: true, ageYears: true, healthNotes: true }
    }),
    prisma.feedingEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "desc" },
      take: 200,
      select: { id: true, dateTime: true, foodType: true, amount: true, note: true }
    }),
    prisma.symptomEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "desc" },
      take: 200,
      select: { id: true, dateTime: true, symptomType: true, severity: true, note: true }
    }),
    prisma.medicineEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "desc" },
      take: 200,
      select: { id: true, dateTime: true, medicineName: true, dosage: true, taken: true, note: true }
    }),
    prisma.weightEntry.findMany({
      where: { userId: input.userId, petId: input.petId, date: { gte: from } },
      orderBy: { date: "desc" },
      take: 200,
      select: { id: true, date: true, weightKg: true }
    }),
    prisma.noteEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "desc" },
      take: 200,
      select: { id: true, dateTime: true, note: true }
    }),
    prisma.waterEntry.findMany({
      where: { userId: input.userId, petId: input.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "desc" },
      take: 200,
      select: { id: true, dateTime: true, amountMl: true, note: true }
    }),
    prisma.vaccinationEntry.findMany({
      where: { userId: input.userId, petId: input.petId, date: { gte: from } },
      orderBy: { date: "desc" },
      take: 200,
      select: { id: true, date: true, procedureType: true, title: true, nextDueDate: true, note: true }
    })
  ]);

  const feeding = [...feedingNewest].reverse();
  const symptoms = [...symptomsNewest].reverse();
  const medicines = [...medicinesNewest].reverse();
  const weights = [...weightsNewest].reverse();
  const notes = [...notesNewest].reverse();
  const water = [...waterNewest].reverse();
  const vaccinations = [...vaccinationsNewest].reverse();
  const relevant = relevantCategories(input.question);

  const imageWarnings: string[] = [];
  const sourceByEntry = new Map<string, string>();
  const rememberSource = (entryType: string, entryId: string, source: string) => {
    sourceByEntry.set(`${entryType}:${entryId}`, source);
  };
  feeding.forEach((entry) => rememberSource("FEEDING", entry.id, `Feeding, ${format.format(entry.dateTime)}, ${entry.foodType}${entry.note ? `, note: ${entry.note}` : ""}`));
  symptoms.forEach((entry) => rememberSource("SYMPTOM", entry.id, `Symptom, ${format.format(entry.dateTime)}, ${entry.symptomType}, severity ${entry.severity}${entry.note ? `, note: ${entry.note}` : ""}`));
  medicines.forEach((entry) => rememberSource("MEDICINE", entry.id, `Medicine, ${format.format(entry.dateTime)}, ${entry.medicineName}${entry.dosage ? `, dosage: ${entry.dosage}` : ""}${entry.note ? `, note: ${entry.note}` : ""}`));
  weights.forEach((entry) => rememberSource("WEIGHT", entry.id, `Weight, ${format.format(entry.date)}, ${entry.weightKg.toString()} kg`));
  notes.forEach((entry) => rememberSource("NOTE", entry.id, `Note, ${format.format(entry.dateTime)}${entry.note ? `, note: ${entry.note}` : ""}`));
  water.forEach((entry) => rememberSource("WATER", entry.id, `Water, ${format.format(entry.dateTime)}, ${entry.amountMl} ml${entry.note ? `, note: ${entry.note}` : ""}`));
  vaccinations.forEach((entry) => rememberSource("VACCINATION", entry.id, `Vaccination/treatment, ${format.format(entry.date)}, ${entry.procedureType}, ${entry.title}${entry.note ? `, note: ${entry.note}` : ""}`));

  const attachmentFilters = [
    { entryType: "FEEDING", ids: feeding.map((entry) => entry.id) },
    { entryType: "SYMPTOM", ids: symptoms.map((entry) => entry.id) },
    { entryType: "MEDICINE", ids: medicines.map((entry) => entry.id) },
    { entryType: "WEIGHT", ids: weights.map((entry) => entry.id) },
    { entryType: "NOTE", ids: notes.map((entry) => entry.id) },
    { entryType: "WATER", ids: water.map((entry) => entry.id) },
    { entryType: "VACCINATION", ids: vaccinations.map((entry) => entry.id) }
  ].filter((item) => item.ids.length > 0);

  const imageAttachments = await (async () => {
    if (!input.includeImages || env.AI_ASSISTANT_IMAGE_LIMIT < 1) return [];
    if (!canUseDirectAttachmentStorage()) {
      imageWarnings.push(warningFor(input.locale, "imagesNoR2"));
      return [];
    }
    if (!attachmentFilters.length) {
      imageWarnings.push(warningFor(input.locale, "imagesNone"));
      return [];
    }

    try {
      const selectedIds = Array.from(new Set(input.imageAttachmentIds ?? [])).slice(0, env.AI_ASSISTANT_IMAGE_LIMIT);
      const imageLimit = Math.max(1, Math.min(input.imageLimit ?? env.AI_ASSISTANT_IMAGE_LIMIT, 20));
      const attachments = await prisma.attachment.findMany({
        where: {
          userId: input.userId,
          petId: input.petId,
          mimeType: { in: ["image/jpeg", "image/png", "image/webp"] },
          ...(selectedIds.length ? { id: { in: selectedIds } } : {}),
          OR: attachmentFilters.map((item) => ({ entryType: item.entryType, entryId: { in: item.ids } }))
        },
        orderBy: { createdAt: "desc" },
        take: selectedIds.length || imageLimit,
        select: {
          id: true,
          entryType: true,
          entryId: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          storageKey: true,
          createdAt: true
        }
      });
      if (!attachments.length) {
        imageWarnings.push(warningFor(input.locale, "imagesNone"));
        return [];
      }
      const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
      const orderedAttachments = selectedIds.length
        ? selectedIds.map((id) => byId.get(id)).filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment))
        : attachments;
      return Promise.all(orderedAttachments.map(async (attachment) => ({
        id: attachment.id,
        entryType: attachment.entryType,
        entryId: attachment.entryId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
        source: sourceByEntry.get(`${attachment.entryType}:${attachment.entryId}`) ?? `${attachment.entryType} record`,
        url: await createAttachmentDownloadUrl({
          storageKey: attachment.storageKey,
          contentType: attachment.mimeType
        })
      })));
    } catch (error) {
      console.warn(JSON.stringify({
        event: "ai_assistant_images_prepare_failed",
        error: error instanceof Error ? error.name : "unknown"
      }));
      imageWarnings.push(warningFor(input.locale, "imagesPrepareFailed"));
      return [];
    }
  })();

  const selectedEntries = {
    feeding: selectRelevantRecords(feeding, "feeding", relevant),
    symptoms: selectRelevantRecords(symptoms, "symptoms", relevant),
    medicines: selectRelevantRecords(medicines, "medicines", relevant),
    weights: selectRelevantRecords(weights, "weights", relevant),
    notes: selectRelevantRecords(notes, "notes", relevant),
    water: selectRelevantRecords(water, "water", relevant),
    vaccinations: selectRelevantRecords(vaccinations, "vaccinations", relevant)
  };

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
    summary: buildAssistantSummary({ timezone: input.timezone, feeding, symptoms, medicines, weights, notes, water, vaccinations }),
    contextSelection: {
      relevantCategories: Array.from(relevant),
      selectedCounts: Object.fromEntries(Object.entries(selectedEntries).map(([key, value]) => [key, value.length])),
      availableCounts: {
        feeding: feeding.length,
        symptoms: symptoms.length,
        medicines: medicines.length,
        weights: weights.length,
        notes: notes.length,
        water: water.length,
        vaccinations: vaccinations.length
      }
    },
    entries: {
      feeding: selectedEntries.feeding.map((entry) => ({ ...entry, sourceRef: `FEEDING:${entry.id}`, localTime: format.format(entry.dateTime) })),
      symptoms: selectedEntries.symptoms.map((entry) => ({ ...entry, sourceRef: `SYMPTOM:${entry.id}`, localTime: format.format(entry.dateTime) })),
      medicines: selectedEntries.medicines.map((entry) => ({ ...entry, sourceRef: `MEDICINE:${entry.id}`, localTime: format.format(entry.dateTime) })),
      weights: selectedEntries.weights.map((entry) => ({ sourceRef: `WEIGHT:${entry.id}`, date: entry.date, localDate: format.format(entry.date), weightKg: entry.weightKg.toString() })),
      notes: selectedEntries.notes.map((entry) => ({ ...entry, sourceRef: `NOTE:${entry.id}`, localTime: format.format(entry.dateTime) })),
      water: selectedEntries.water.map((entry) => ({ ...entry, sourceRef: `WATER:${entry.id}`, localTime: format.format(entry.dateTime) })),
      vaccinations: selectedEntries.vaccinations.map((entry) => ({
        ...entry,
        sourceRef: `VACCINATION:${entry.id}`,
        localDate: format.format(entry.date),
        nextDueLocalDate: entry.nextDueDate ? format.format(entry.nextDueDate) : null
      }))
    },
    imageAttachments,
    imageWarnings
  };
}

async function askAiProvider(input: {
  mode: typeof assistantModes[number];
  question?: string | null;
  locale?: string | null;
  history: Array<z.infer<typeof assistantHistoryMessageSchema>>;
  data: Awaited<ReturnType<typeof loadAssistantData>>;
}) {
  const attempts: Array<{
    provider: "minimax" | "openrouter";
    apiKey: string;
    model: string;
    url: string;
    timeoutMs: number;
    tokenField: "max_completion_tokens" | "max_tokens";
    includeVision: boolean;
  }> = [];

  if (env.OPENROUTER_API_KEY_AI_HELPER) {
    const apiKey = env.OPENROUTER_API_KEY_AI_HELPER;
    const models = Array.from(new Set([env.OPENROUTER_AI_HELPER_MODEL, env.OPENROUTER_AI_HELPER_MODEL_FALLBACK]));
    models.forEach((model, index) => attempts.push({
      provider: "openrouter",
      apiKey,
      model,
      url: "https://openrouter.ai/api/v1/chat/completions",
      timeoutMs: env.OPENROUTER_AI_HELPER_TIMEOUT_MS,
      tokenField: "max_tokens",
      includeVision: index === 0
    }));
  }

  if (env.MINIMAX_API_KEY) {
    attempts.push({
      provider: "minimax",
      apiKey: env.MINIMAX_API_KEY,
      model: env.MINIMAX_REPORT_MODEL ?? env.MINIMAX_PARSER_MODEL,
      url: `${env.MINIMAX_API_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`,
      timeoutMs: env.MINIMAX_AI_TIMEOUT_MS,
      tokenField: "max_completion_tokens",
      includeVision: false
    });
  }

  if (!attempts.length) throw new HttpError(503, "AI_ASSISTANT_UNAVAILABLE", "AI assistant provider is not configured.");

  let lastError: unknown;
  for (const [attemptIndex, attempt] of attempts.entries()) {
    try {
      return await askChatCompletionProvider({ ...input, ...attempt });
    } catch (error) {
      lastError = error;
      console.warn(JSON.stringify({
        event: "ai_assistant_attempt_failed",
        provider: attempt.provider,
        model: attempt.model,
        attempt: attemptIndex + 1,
        hasFallback: attemptIndex < attempts.length - 1,
        reason: error instanceof HttpError ? error.code : error instanceof Error ? error.name : "unknown"
      }));
    }
  }

  throw lastError instanceof HttpError
    ? lastError
    : new HttpError(502, "AI_ASSISTANT_FAILED", "AI assistant provider failed.");
}

async function askChatCompletionProvider(input: {
  mode: typeof assistantModes[number];
  question?: string | null;
  locale?: string | null;
  history: Array<z.infer<typeof assistantHistoryMessageSchema>>;
  data: Awaited<ReturnType<typeof loadAssistantData>>;
  provider: "minimax" | "openrouter";
  apiKey: string;
  model: string;
  url: string;
  timeoutMs: number;
  tokenField: "max_completion_tokens" | "max_tokens";
  includeVision: boolean;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const visionImages = input.provider === "openrouter" && input.includeVision ? input.data.imageAttachments : [];
    const reportData = {
      ...input.data,
      imageAnalysisEnabled: visionImages.length > 0,
      imageAttachments: input.data.imageAttachments.map(({ url: _url, ...attachment }) => attachment)
    };
    const userText = JSON.stringify({
      mode: input.mode,
      task: modeInstruction(input.mode),
      question: input.question,
      reportData
    });
    const userContent = visionImages.length
      ? [
          { type: "text", text: userText },
          ...visionImages.map((image) => ({
            type: "image_url",
            image_url: { url: image.url }
          }))
        ]
      : userText;

    const response = await fetch(input.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        ...(input.provider === "openrouter" ? { "HTTP-Referer": env.FRONTEND_URL, "X-Title": "PetCare Diary" } : {})
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content: [
              "You are a cautious pet diary assistant.",
              "Never diagnose. Never prescribe treatment. Never change medication, dosage, or stop medication.",
              "Never present a possible explanation as a diagnosis or certainty.",
              "You may summarize diary records, suggest questions to ask a veterinarian, suggest what data to track next, and recommend contacting a veterinarian for severe, recurring, or worsening symptoms.",
              "You may mention simple, common, non-diagnostic possibilities when they are safe and clearly supported by the diary context, using phrases like 'one possible explanation' or 'this can sometimes happen when'.",
              "When image inputs are attached, use them as visual context together with the diary records. Describe only visible, relevant details and uncertainty; do not infer a diagnosis from an image.",
              "If image metadata is present but imageAnalysisEnabled is false, do not claim you inspected the photos.",
              "Do not include a final medical disclaimer in the answer. The app already shows a separate disclaimer below the answer.",
              "Do not write phrases like 'I am not a veterinarian', 'I am not a doctor', or 'this does not replace veterinary care' inside the answer.",
              "Still mention urgent red flags and when to contact a veterinarian urgently when relevant.",
              "Use careful non-diagnostic language.",
              "Use a warm, calm, practical tone. Help the owner understand what to observe before defaulting to 'ask a veterinarian'.",
              "Do not include chain-of-thought or hidden reasoning.",
              "Do not include <think> tags.",
              "Return only the final user-facing answer.",
              "Follow the task from the user message exactly.",
              "Use a clear mobile-friendly structure. Prefer 4-7 short sections or bullets. Be practical, but not overly terse.",
              "Use '-' for bullet points. Do not use '*' as a markdown bullet. If you use numbered sections, nested items must use '-' bullets.",
              "When you make an observation based on diary records, cite the record type and exact local dates in parentheses, for example: (symptoms: 12 Jul, 15 Jul).",
              "Never invent an evidence date or source. If the supplied records do not support a claim, say that clearly.",
              `Answer in ${responseLanguage(input.locale)}.`,
              "Return plain text only."
            ].join("\n")
          },
          ...input.history.map((message) => ({ role: message.role, content: message.content })),
          {
            role: "user",
            content: userContent
          }
        ],
        temperature: 0.2,
        ...(input.tokenField === "max_tokens" ? { max_tokens: 1100 } : { max_completion_tokens: 1100 })
      })
    });
    const data = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = data?.choices?.[0]?.message?.content;
    if (!response.ok || typeof content !== "string" || !content.trim()) {
      console.warn(JSON.stringify({
        event: "ai_assistant_provider_failed",
        provider: input.provider,
        model: input.model,
        status: response.status,
        reason: !response.ok ? "provider_non_ok" : "invalid_provider_response"
      }));
      throw new HttpError(502, "AI_ASSISTANT_FAILED", "AI assistant provider failed.");
    }
    const sanitized = sanitizeAiFinalAnswer(content, 4000);
    if (sanitized.reasoningStripped) {
      console.warn(JSON.stringify({ event: "ai_assistant_response_sanitized", ai_assistant_reasoning_stripped: true }));
    }
    if (!sanitized.text) {
      throw new HttpError(502, "AI_ASSISTANT_FAILED", "AI assistant provider returned an empty final answer.");
    }
    return sanitized.text;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.warn(JSON.stringify({ event: "ai_assistant_failed", error: error instanceof Error ? error.name : "unknown" }));
    throw new HttpError(502, "AI_ASSISTANT_FAILED", "AI assistant provider failed.");
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/photos", async (req, res, next) => {
  try {
    const query = assistantPhotosQuerySchema.parse(req.query);
    const timezone = safeTimezone(query.timezone);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const data = await loadAssistantData({
      userId: req.user!.id,
      petId: query.petId,
      period: query.period,
      timezone,
      locale: query.locale ?? req.user!.languageCode,
      includeImages: true,
      imageLimit: 20
    });
    res.json({
      items: data.imageAttachments,
      limit: env.AI_ASSISTANT_IMAGE_LIMIT,
      warnings: data.imageWarnings
    });
  } catch (error) {
    next(error);
  }
});

router.post("/assistant", async (req, res, next) => {
  try {
    const body = assistantBodySchema.parse(req.body);
    const timezone = safeTimezone(body.timezone);
    if (body.mode === "GENERAL_HELP" && !body.question?.trim()) {
      throw new HttpError(400, "AI_ASSISTANT_QUESTION_REQUIRED", "Question is required for GENERAL_HELP mode.");
    }
    await assertPetBelongsToUser(body.petId, req.user!.id);
    await assertDailyLimit(req.user!.id);
    const data = await loadAssistantData({
      userId: req.user!.id,
      petId: body.petId,
      period: body.period,
      timezone,
      locale: body.locale ?? req.user!.languageCode,
      includeImages: body.includeImages || body.imageAttachmentIds.length > 0,
      imageAttachmentIds: body.imageAttachmentIds,
      question: body.question
    });
    const answer = await askAiProvider({
      mode: body.mode,
      question: body.question,
      locale: body.locale ?? req.user!.languageCode,
      history: body.history,
      data
    });
    await trackAnalyticsEvent({
      userId: req.user!.id,
      event: "ai_assistant_used",
      metadata: {
        petId: body.petId,
        mode: body.mode,
        period: body.period,
        selectedImageCount: data.imageAttachments.length,
        historyMessageCount: body.history.length
      }
    });
    res.json({
      answer,
      disclaimer: disclaimerFor(body.locale ?? req.user!.languageCode),
      usedPeriod: body.period,
      warnings: data.imageWarnings
    });
  } catch (error) {
    next(error);
  }
});

export default router;
