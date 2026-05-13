import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { trackAnalyticsEvent } from "../services/analytics.service.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";
import { serialize } from "../utils/serialize.js";
import { HttpError } from "../utils/httpError.js";

const router = Router();
const dailyExportLimit = 3;

type ReportLanguage = "ru" | "en" | "es" | "fr" | "de" | "zh";

const reportText = {
  ru: {
    pet: "Питомец",
    petType: "Тип",
    age: "Возраст",
    currentWeight: "Текущий вес",
    healthNotes: "Заметки о здоровье",
    period: "Период",
    generated: "Сформировано",
    allTime: "все время",
    lastDays: (days: number) => `последние ${days} дн.`,
    summary: "Сводка",
    analytics: "Аналитика",
    importantForVet: "Что важно показать ветеринару",
    aiUnavailable: "AI-сводка временно недоступна.",
    weightTrend: "Динамика веса",
    firstWeight: "Первый вес",
    lastWeight: "Последний вес",
    weightChange: "Изменение",
    minWeight: "Минимум",
    maxWeight: "Максимум",
    feedingByType: "Кормления по типам",
    symptomsByType: "Симптомы по типам и тяжести",
    medicinesStatus: "Лекарства: принято / не принято",
    notesSummary: "Заметки",
    feeding: "Кормление",
    symptoms: "Симптомы",
    medicines: "Лекарства",
    weight: "Вес",
    notes: "Заметки",
    feedingsCount: "Кормления",
    symptomsCount: "Симптомы",
    medicinesCount: "Лекарства",
    medicinesTaken: "Лекарства приняты",
    weightRecords: "Записи веса",
    otherNotes: "Другие заметки",
    foodType: "Тип корма",
    amount: "Количество",
    comment: "Комментарий",
    symptomType: "Тип симптома",
    severity: "Тяжесть",
    medicineName: "Название",
    dosage: "Дозировка",
    status: "Статус",
    taken: "принято",
    notTaken: "не принято",
    noRecords: "Нет записей за этот период.",
    kg: "кг",
    years: "лет",
    disclaimer: "PetCare Diary не заменяет ветеринарную помощь. Если симптомы повторяются или состояние ухудшается, обратитесь к ветеринару.",
    petTypes: { CAT: "Кошка", DOG: "Собака", OTHER: "Другое" },
    foodLabels: { DRY: "Сухой корм", WET: "Влажный корм", NATURAL: "Натуральная еда", TREAT: "Лакомство", OTHER: "Другое" },
    symptomLabels: {
      VOMITING: "Рвота",
      YELLOW_VOMIT: "Желтая рвота",
      NO_APPETITE: "Нет аппетита",
      DIARRHEA: "Диарея",
      CONSTIPATION: "Запор",
      LETHARGY: "Вялость",
      PAIN: "Боль",
      OTHER: "Другое"
    }
  },
  en: {
    pet: "Pet",
    petType: "Type",
    age: "Age",
    currentWeight: "Current weight",
    healthNotes: "Health notes",
    period: "Period",
    generated: "Generated",
    allTime: "all time",
    lastDays: (days: number) => `last ${days} days`,
    summary: "Summary",
    analytics: "Analytics",
    importantForVet: "What to show the veterinarian",
    aiUnavailable: "AI summary is temporarily unavailable.",
    weightTrend: "Weight trend",
    firstWeight: "First weight",
    lastWeight: "Last weight",
    weightChange: "Change",
    minWeight: "Minimum",
    maxWeight: "Maximum",
    feedingByType: "Feedings by food type",
    symptomsByType: "Symptoms by type and severity",
    medicinesStatus: "Medicines: taken / not taken",
    notesSummary: "Notes",
    feeding: "Feeding",
    symptoms: "Symptoms",
    medicines: "Medicines",
    weight: "Weight",
    notes: "Notes",
    feedingsCount: "Feedings",
    symptomsCount: "Symptoms",
    medicinesCount: "Medicines",
    medicinesTaken: "Medicines taken",
    weightRecords: "Weight records",
    otherNotes: "Other notes",
    foodType: "Food type",
    amount: "Amount",
    comment: "Comment",
    symptomType: "Symptom type",
    severity: "Severity",
    medicineName: "Name",
    dosage: "Dosage",
    status: "Status",
    taken: "taken",
    notTaken: "not taken",
    noRecords: "No records for this period.",
    kg: "kg",
    years: "years",
    disclaimer: "PetCare Diary does not replace veterinary care. If symptoms repeat or condition worsens, contact a veterinarian.",
    petTypes: { CAT: "Cat", DOG: "Dog", OTHER: "Other" },
    foodLabels: { DRY: "Dry food", WET: "Wet food", NATURAL: "Natural food", TREAT: "Treat", OTHER: "Other" },
    symptomLabels: {
      VOMITING: "Vomiting",
      YELLOW_VOMIT: "Yellow vomit",
      NO_APPETITE: "No appetite",
      DIARRHEA: "Diarrhea",
      CONSTIPATION: "Constipation",
      LETHARGY: "Lethargy",
      PAIN: "Pain",
      OTHER: "Other"
    }
  }
};

type ReportText = typeof reportText.en;

const localizedReportText: Record<ReportLanguage, ReportText> = {
  ru: reportText.ru,
  en: reportText.en,
  es: {
    ...reportText.en,
    pet: "Mascota",
    petType: "Tipo",
    age: "Edad",
    currentWeight: "Peso actual",
    healthNotes: "Notas de salud",
    period: "Periodo",
    generated: "Generado",
    allTime: "todo el tiempo",
    lastDays: (days: number) => `ultimos ${days} dias`,
    summary: "Resumen",
    analytics: "Analitica",
    importantForVet: "Que mostrar al veterinario",
    aiUnavailable: "El resumen de IA no esta disponible temporalmente.",
    weightTrend: "Dinamica de peso",
    feedingByType: "Comidas por tipo",
    symptomsByType: "Sintomas por tipo y gravedad",
    medicinesStatus: "Medicinas: tomadas / no tomadas",
    feeding: "Alimentacion",
    symptoms: "Sintomas",
    medicines: "Medicinas",
    weight: "Peso",
    notes: "Notas",
    feedingsCount: "Comidas",
    symptomsCount: "Sintomas",
    medicinesCount: "Medicinas",
    medicinesTaken: "Medicinas tomadas",
    weightRecords: "Registros de peso",
    otherNotes: "Otras notas",
    foodType: "Tipo de comida",
    amount: "Cantidad",
    comment: "Comentario",
    symptomType: "Tipo de sintoma",
    severity: "Gravedad",
    medicineName: "Nombre",
    dosage: "Dosis",
    status: "Estado",
    taken: "tomado",
    notTaken: "no tomado",
    noRecords: "No hay registros para este periodo.",
    years: "anos",
    disclaimer: "PetCare Diary no reemplaza la atencion veterinaria. Si los sintomas se repiten o el estado empeora, contacte a un veterinario.",
    petTypes: { CAT: "Gato", DOG: "Perro", OTHER: "Otro" },
    foodLabels: { DRY: "Comida seca", WET: "Comida humeda", NATURAL: "Comida natural", TREAT: "Premio", OTHER: "Otro" },
    symptomLabels: { VOMITING: "Vomitos", YELLOW_VOMIT: "Vomito amarillo", NO_APPETITE: "Sin apetito", DIARRHEA: "Diarrea", CONSTIPATION: "Estrenimiento", LETHARGY: "Letargo", PAIN: "Dolor", OTHER: "Otro" }
  },
  fr: {
    ...reportText.en,
    pet: "Animal",
    petType: "Type",
    age: "Age",
    currentWeight: "Poids actuel",
    healthNotes: "Notes de sante",
    period: "Periode",
    generated: "Genere",
    allTime: "toute la periode",
    lastDays: (days: number) => `${days} derniers jours`,
    summary: "Resume",
    analytics: "Analytique",
    importantForVet: "A montrer au veterinaire",
    aiUnavailable: "Le resume IA est temporairement indisponible.",
    weightTrend: "Evolution du poids",
    feedingByType: "Repas par type",
    symptomsByType: "Symptomes par type et gravite",
    medicinesStatus: "Medicaments: pris / non pris",
    feeding: "Alimentation",
    symptoms: "Symptomes",
    medicines: "Medicaments",
    weight: "Poids",
    notes: "Notes",
    feedingsCount: "Repas",
    symptomsCount: "Symptomes",
    medicinesCount: "Medicaments",
    medicinesTaken: "Medicaments pris",
    weightRecords: "Releves de poids",
    otherNotes: "Autres notes",
    foodType: "Type d'aliment",
    amount: "Quantite",
    comment: "Commentaire",
    symptomType: "Type de symptome",
    severity: "Gravite",
    medicineName: "Nom",
    dosage: "Dosage",
    status: "Statut",
    taken: "pris",
    notTaken: "non pris",
    noRecords: "Aucun enregistrement pour cette periode.",
    years: "ans",
    disclaimer: "PetCare Diary ne remplace pas les soins veterinaires. Si les symptomes se repetent ou l'etat s'aggrave, contactez un veterinaire.",
    petTypes: { CAT: "Chat", DOG: "Chien", OTHER: "Autre" },
    foodLabels: { DRY: "Aliment sec", WET: "Aliment humide", NATURAL: "Aliment naturel", TREAT: "Friandise", OTHER: "Autre" },
    symptomLabels: { VOMITING: "Vomissements", YELLOW_VOMIT: "Vomissement jaune", NO_APPETITE: "Pas d'appetit", DIARRHEA: "Diarrhee", CONSTIPATION: "Constipation", LETHARGY: "Lethargie", PAIN: "Douleur", OTHER: "Autre" }
  },
  de: {
    ...reportText.en,
    pet: "Haustier",
    petType: "Typ",
    age: "Alter",
    currentWeight: "Aktuelles Gewicht",
    healthNotes: "Gesundheitsnotizen",
    period: "Zeitraum",
    generated: "Erstellt",
    allTime: "gesamte Zeit",
    lastDays: (days: number) => `letzte ${days} Tage`,
    summary: "Zusammenfassung",
    analytics: "Analyse",
    importantForVet: "Wichtig fur den Tierarzt",
    aiUnavailable: "KI-Zusammenfassung ist vorubergehend nicht verfugbar.",
    weightTrend: "Gewichtsverlauf",
    feedingByType: "Futterungen nach Typ",
    symptomsByType: "Symptome nach Typ und Schwere",
    medicinesStatus: "Medikamente: genommen / nicht genommen",
    feeding: "Futterung",
    symptoms: "Symptome",
    medicines: "Medikamente",
    weight: "Gewicht",
    notes: "Notizen",
    feedingsCount: "Futterungen",
    symptomsCount: "Symptome",
    medicinesCount: "Medikamente",
    medicinesTaken: "Medikamente genommen",
    weightRecords: "Gewichtseintrage",
    otherNotes: "Andere Notizen",
    foodType: "Futtertyp",
    amount: "Menge",
    comment: "Kommentar",
    symptomType: "Symptomtyp",
    severity: "Schwere",
    medicineName: "Name",
    dosage: "Dosierung",
    status: "Status",
    taken: "genommen",
    notTaken: "nicht genommen",
    noRecords: "Keine Eintrage fur diesen Zeitraum.",
    years: "Jahre",
    disclaimer: "PetCare Diary ersetzt keine tierarztliche Versorgung. Wenn Symptome wiederkehren oder sich der Zustand verschlechtert, kontaktieren Sie einen Tierarzt.",
    petTypes: { CAT: "Katze", DOG: "Hund", OTHER: "Andere" },
    foodLabels: { DRY: "Trockenfutter", WET: "Nassfutter", NATURAL: "Naturlich", TREAT: "Leckerli", OTHER: "Andere" },
    symptomLabels: { VOMITING: "Erbrechen", YELLOW_VOMIT: "Gelbes Erbrechen", NO_APPETITE: "Kein Appetit", DIARRHEA: "Durchfall", CONSTIPATION: "Verstopfung", LETHARGY: "Lethargie", PAIN: "Schmerz", OTHER: "Andere" }
  },
  zh: {
    ...reportText.en,
    pet: "宠物",
    petType: "类型",
    age: "年龄",
    currentWeight: "当前体重",
    healthNotes: "健康备注",
    period: "期间",
    generated: "生成时间",
    allTime: "全部时间",
    lastDays: (days: number) => `最近 ${days} 天`,
    summary: "摘要",
    analytics: "分析",
    importantForVet: "建议给兽医看的重点",
    aiUnavailable: "AI 摘要暂时不可用。",
    weightTrend: "体重变化",
    feedingByType: "按类型统计喂食",
    symptomsByType: "按类型和严重程度统计症状",
    medicinesStatus: "用药：已服 / 未服",
    feeding: "喂食",
    symptoms: "症状",
    medicines: "药物",
    weight: "体重",
    notes: "备注",
    feedingsCount: "喂食",
    symptomsCount: "症状",
    medicinesCount: "药物",
    medicinesTaken: "已服药物",
    weightRecords: "体重记录",
    otherNotes: "其他备注",
    foodType: "食物类型",
    amount: "数量",
    comment: "评论",
    symptomType: "症状类型",
    severity: "严重程度",
    medicineName: "名称",
    dosage: "剂量",
    status: "状态",
    taken: "已服",
    notTaken: "未服",
    noRecords: "此期间没有记录。",
    years: "岁",
    disclaimer: "PetCare Diary 不能替代兽医诊疗。如果症状反复或情况恶化，请联系兽医。",
    petTypes: { CAT: "猫", DOG: "狗", OTHER: "其他" },
    foodLabels: { DRY: "干粮", WET: "湿粮", NATURAL: "天然食物", TREAT: "零食", OTHER: "其他" },
    symptomLabels: { VOMITING: "呕吐", YELLOW_VOMIT: "黄色呕吐", NO_APPETITE: "没有食欲", DIARRHEA: "腹泻", CONSTIPATION: "便秘", LETHARGY: "嗜睡", PAIN: "疼痛", OTHER: "其他" }
  }
};

const reportQuerySchema = z.object({
  petId: z.string().min(1).max(128),
  period: z.preprocess(
    (value) => value === "all" ? "all" : Number(value),
    z.union([z.literal("all"), z.number().int().refine((value) => [7, 14, 30].includes(value))])
  ),
  timezone: z.string().min(1).max(80).optional(),
  locale: z.string().min(2).max(16).optional(),
  tgInitData: z.string().min(1).max(12000).optional()
}).strict();
type ReportPrisma = Pick<
  Prisma.TransactionClient,
  "pet" | "feedingEntry" | "symptomEntry" | "medicineEntry" | "weightEntry" | "noteEntry"
>;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function buildReport(db: ReportPrisma, userId: string, petId: string, period: number | "all") {
  const from = period === "all" ? null : new Date(Date.now() - period * 24 * 60 * 60 * 1000);
  const pet = await db.pet.findFirst({
    where: { id: petId, userId },
    select: { id: true, name: true, type: true, weightKg: true, ageYears: true, healthNotes: true }
  });
  const dateFilter = from ? { gte: from } : undefined;
  const [feeding, symptoms, medicines, medicinesTaken, weights, notes, feedingEntries, symptomEntries, medicineEntries, weightEntries, noteEntries] = await Promise.all([
    db.feedingEntry.count({ where: { userId, petId, dateTime: dateFilter } }),
    db.symptomEntry.count({ where: { userId, petId, dateTime: dateFilter } }),
    db.medicineEntry.count({ where: { userId, petId, dateTime: dateFilter } }),
    db.medicineEntry.count({ where: { userId, petId, dateTime: dateFilter, taken: true } }),
    db.weightEntry.count({ where: { userId, petId, date: dateFilter } }),
    db.noteEntry.count({ where: { userId, petId, dateTime: dateFilter } }),
    db.feedingEntry.findMany({
      where: { userId, petId, dateTime: dateFilter },
      select: { id: true, dateTime: true, foodType: true, amount: true, note: true },
      orderBy: { dateTime: "asc" }
    }),
    db.symptomEntry.findMany({
      where: { userId, petId, dateTime: dateFilter },
      select: { id: true, dateTime: true, symptomType: true, severity: true, note: true },
      orderBy: { dateTime: "asc" }
    }),
    db.medicineEntry.findMany({
      where: { userId, petId, dateTime: dateFilter },
      select: { id: true, dateTime: true, medicineName: true, dosage: true, taken: true, note: true },
      orderBy: { dateTime: "asc" }
    }),
    db.weightEntry.findMany({
      where: { userId, petId, date: dateFilter },
      select: { id: true, date: true, weightKg: true },
      orderBy: { date: "asc" }
    }),
    db.noteEntry.findMany({
      where: { userId, petId, dateTime: dateFilter },
      select: { id: true, note: true, dateTime: true },
      orderBy: { dateTime: "asc" }
    })
  ]);

  const counts = { feeding, symptoms, medicines, medicinesTaken, weights, notes };
  const entries = { feeding: feedingEntries, symptoms: symptomEntries, medicines: medicineEntries, weights: weightEntries, notes: noteEntries };
  return { period, from, pet, petName: pet?.name ?? "Pet", counts, entries };
}

function reportAnalytics(report: Awaited<ReturnType<typeof buildReport>>) {
  const weightValues = report.entries.weights
    .map((entry) => ({ date: entry.date, weightKg: numberValue(entry.weightKg) }))
    .filter((entry): entry is { date: Date; weightKg: number } => entry.weightKg !== null);
  const firstWeight = weightValues[0];
  const lastWeight = weightValues.at(-1);
  const weightNumbers = weightValues.map((entry) => entry.weightKg);
  const feedingByType = report.entries.feeding.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.foodType] = (acc[entry.foodType] ?? 0) + 1;
    return acc;
  }, {});
  const symptomsByType = report.entries.symptoms.reduce<Record<string, { count: number; severitySum: number; maxSeverity: number }>>((acc, entry) => {
    const current = acc[entry.symptomType] ?? { count: 0, severitySum: 0, maxSeverity: 0 };
    current.count += 1;
    current.severitySum += entry.severity;
    current.maxSeverity = Math.max(current.maxSeverity, entry.severity);
    acc[entry.symptomType] = current;
    return acc;
  }, {});
  const medicinesTaken = report.entries.medicines.filter((entry) => entry.taken).length;
  const medicinesNotTaken = report.entries.medicines.length - medicinesTaken;

  return {
    weight: {
      first: firstWeight ?? null,
      last: lastWeight ?? null,
      change: firstWeight && lastWeight ? lastWeight.weightKg - firstWeight.weightKg : null,
      min: weightNumbers.length ? Math.min(...weightNumbers) : null,
      max: weightNumbers.length ? Math.max(...weightNumbers) : null
    },
    feedingByType,
    symptomsByType,
    medicines: {
      taken: medicinesTaken,
      notTaken: medicinesNotTaken
    },
    notes: {
      count: report.entries.notes.length,
      latest: report.entries.notes.at(-1) ?? null
    }
  };
}

function reportDataForAi(report: Awaited<ReturnType<typeof buildReport>>) {
  return {
    pet: {
      name: report.pet?.name ?? report.petName,
      type: report.pet?.type,
      ageYears: report.pet?.ageYears,
      currentWeightKg: report.pet?.weightKg?.toString(),
      healthNotes: report.pet?.healthNotes
    },
    period: report.period,
    counts: report.counts,
    analytics: reportAnalytics(report),
    entries: {
      feeding: report.entries.feeding.map((entry) => ({
        dateTime: entry.dateTime.toISOString(),
        foodType: entry.foodType,
        amount: entry.amount,
        note: entry.note
      })),
      symptoms: report.entries.symptoms.map((entry) => ({
        dateTime: entry.dateTime.toISOString(),
        symptomType: entry.symptomType,
        severity: entry.severity,
        note: entry.note
      })),
      medicines: report.entries.medicines.map((entry) => ({
        dateTime: entry.dateTime.toISOString(),
        medicineName: entry.medicineName,
        dosage: entry.dosage,
        taken: entry.taken,
        note: entry.note
      })),
      weights: report.entries.weights.map((entry) => ({
        date: entry.date.toISOString(),
        weightKg: entry.weightKg.toString()
      })),
      notes: report.entries.notes.map((entry) => ({
        dateTime: entry.dateTime.toISOString(),
        note: entry.note
      }))
    }
  };
}

function aiPromptLanguage(language: ReportLanguage) {
  const names: Record<ReportLanguage, string> = {
    ru: "Russian",
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    zh: "Chinese"
  };
  return names[language];
}

async function buildAiVetSummary(report: Awaited<ReturnType<typeof buildReport>>, language: ReportLanguage) {
  if (!env.MINIMAX_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
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
              "You create a cautious veterinary visit summary for a pet diary PDF.",
              "Do not diagnose. Do not prescribe treatment. Do not suggest medication changes.",
              "Use cautious wording: pay attention, discuss with a veterinarian, it may be useful to show the doctor.",
              "If data is sparse, say there is not enough data for conclusions.",
              `Write in ${aiPromptLanguage(language)}.`,
              "Return plain text only, 3-6 concise bullet-like lines, no Markdown table."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify(reportDataForAi(report))
          }
        ],
        temperature: 0.2,
        max_completion_tokens: 500
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !Array.isArray(data.choices)) {
      console.warn(JSON.stringify({
        event: "report_ai_summary_failed",
        status: response.status,
        reason: !response.ok ? "provider_non_ok" : "invalid_provider_response"
      }));
      return null;
    }
    const content = data.choices[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim().slice(0, 2500) : null;
  } catch (error) {
    console.warn(JSON.stringify({
      event: "report_ai_summary_failed",
      error: error instanceof Error ? error.name : "unknown"
    }));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function pdfFont(doc: PDFKit.PDFDocument) {
  const candidates = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf"
  ];
  const fontPath = candidates.find((candidate) => existsSync(candidate));
  if (!fontPath) return "Helvetica";
  doc.registerFont("PetCareFont", fontPath);
  return "PetCareFont";
}

function safeTimezone(timezone?: string | null) {
  if (!timezone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

function reportLanguage(locale?: string | null, languageCode?: string | null): ReportLanguage {
  const value = (locale ?? languageCode ?? "").toLowerCase();
  if (value.startsWith("ru")) return "ru";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("de")) return "de";
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "en";
}

function reportLocale(locale: string | undefined, language: ReportLanguage) {
  const defaults: Record<ReportLanguage, string> = {
    ru: "ru-RU",
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    zh: "zh-CN"
  };
  if (locale) {
    try {
      new Intl.DateTimeFormat(locale).format(new Date());
      return locale;
    } catch {
      return defaults[language];
    }
  }
  return defaults[language];
}

function dateFormatter(locale: string, timezone: string, options?: Intl.DateTimeFormatOptions) {
  const base = options ?? {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  } satisfies Intl.DateTimeFormatOptions;
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    ...base
  });
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function reportFormatOptions(query: { timezone?: string; locale?: string }, userLanguageCode?: string | null) {
  const timezone = safeTimezone(query.timezone);
  const language = reportLanguage(query.locale, userLanguageCode);
  const locale = reportLocale(query.locale, language);
  return { timezone, language, locale };
}

function formattedReportSummary(report: Awaited<ReturnType<typeof buildReport>>, options: { timezone: string; locale: string }) {
  const formatDateTime = dateFormatter(options.locale, options.timezone);
  const formatDateOnly = dateFormatter(options.locale, options.timezone, { year: "numeric", month: "2-digit", day: "2-digit" });
  return {
    timezone: options.timezone,
    locale: options.locale,
    generatedAt: new Date().toISOString(),
    generatedAtFormatted: formatDateTime.format(new Date()),
    fromFormatted: report.from ? formatDateTime.format(report.from) : null,
    analytics: reportAnalytics(report),
    entries: {
      feeding: report.entries.feeding.map((entry) => ({ id: entry.id, dateTime: formatDateTime.format(entry.dateTime) })),
      symptoms: report.entries.symptoms.map((entry) => ({ id: entry.id, dateTime: formatDateTime.format(entry.dateTime) })),
      medicines: report.entries.medicines.map((entry) => ({ id: entry.id, dateTime: formatDateTime.format(entry.dateTime) })),
      weights: report.entries.weights.map((entry) => ({ id: entry.id, date: formatDateOnly.format(entry.date) })),
      notes: report.entries.notes.map((entry) => ({ id: entry.id, dateTime: formatDateTime.format(entry.dateTime) }))
    }
  };
}

export async function renderReportPdf(report: Awaited<ReturnType<typeof buildReport>>, options: { language: ReportLanguage; locale: string; timezone: string }) {
  const aiSummary = await buildAiVetSummary(report, options.language);
  return new Promise<Buffer>((resolve, reject) => {
    const text = localizedReportText[options.language];
    const formatDateTime = dateFormatter(options.locale, options.timezone);
    const formatDate = dateFormatter(options.locale, options.timezone, { year: "numeric", month: "2-digit", day: "2-digit" });
    const analytics = reportAnalytics(report);
    const doc = new PDFDocument({
      size: "A4",
      margin: 44,
      info: {
        Author: "PetCare Diary"
      }
    });
    const chunks: Buffer[] = [];
    const font = pdfFont(doc);

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const periodLabel = report.period === "all" ? text.allTime : text.lastDays(report.period);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const value = (label: string, content?: string | null) => {
      if (!content) return;
      doc.font(font).fontSize(10).fillColor("#17202a").text(`${label}: ${content}`, { width: pageWidth });
    };

    value(text.pet, report.petName);
    value(text.petType, report.pet ? text.petTypes[report.pet.type] ?? report.pet.type : null);
    value(text.age, report.pet?.ageYears ? `${report.pet.ageYears.toString()} ${text.years}` : null);
    value(text.currentWeight, report.pet?.weightKg ? `${report.pet.weightKg.toString()} ${text.kg}` : null);
    value(text.healthNotes, report.pet?.healthNotes);
    value(text.period, periodLabel);
    value(text.generated, formatDateTime.format(new Date()));
    value("Timezone", options.timezone);
    doc.moveDown(1);

    doc.fillColor("#17202a").fontSize(15).text(text.summary);
    doc.moveDown(0.5);
    const rows = [
      [text.feedingsCount, report.counts.feeding],
      [text.symptomsCount, report.counts.symptoms],
      [text.medicinesCount, report.counts.medicines],
      [text.medicinesTaken, report.counts.medicinesTaken],
      [text.weightRecords, report.counts.weights],
      [text.otherNotes, report.counts.notes]
    ] as const;

    rows.forEach(([label, count]) => {
      doc.font(font).fontSize(12).fillColor("#17202a").text(`${label}: `, { continued: true });
      doc.font(font).fillColor("#1f9d8a").text(String(count));
    });

    const ensureSpace = (height = 90) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - height) doc.addPage();
    };
    const section = (title: string) => {
      ensureSpace();
      doc.moveDown(0.8);
      doc.fillColor("#17202a").fontSize(15).text(title);
      doc.moveDown(0.35);
    };
    const empty = () => doc.font(font).fontSize(10).fillColor("#8a91a0").text(text.noRecords);
    const line = (date: Date, details: Array<[string, string | null | undefined]>) => {
      ensureSpace();
      doc.font(font).fontSize(10).fillColor("#5f6673").text(formatDateTime.format(new Date(date)));
      details.forEach(([label, content]) => {
        if (!content) return;
        doc.font(font).fontSize(10).fillColor("#17202a").text(`${label}: ${content}`, { width: pageWidth });
      });
      doc.moveDown(0.4);
    };
    const statLine = (label: string, content: string | number | null | undefined) => {
      if (content === null || content === undefined || content === "") return;
      ensureSpace(40);
      doc.font(font).fontSize(10).fillColor("#17202a").text(`${label}: ${String(content)}`, { width: pageWidth });
    };
    const weightLabel = (value: number | null | undefined) => value === null || value === undefined ? null : `${value.toFixed(2)} ${text.kg}`;

    section(text.analytics);
    section(text.weightTrend);
    if (analytics.weight.first && analytics.weight.last) {
      statLine(text.firstWeight, `${weightLabel(analytics.weight.first.weightKg)} (${formatDate.format(analytics.weight.first.date)})`);
      statLine(text.lastWeight, `${weightLabel(analytics.weight.last.weightKg)} (${formatDate.format(analytics.weight.last.date)})`);
      statLine(text.weightChange, weightLabel(analytics.weight.change));
      statLine(text.minWeight, weightLabel(analytics.weight.min));
      statLine(text.maxWeight, weightLabel(analytics.weight.max));
    } else empty();

    section(text.feedingByType);
    const feedingRows = Object.entries(analytics.feedingByType);
    if (feedingRows.length) {
      feedingRows.forEach(([type, count]) => statLine(text.foodLabels[type as keyof typeof text.foodLabels] ?? type, count));
    } else empty();

    section(text.symptomsByType);
    const symptomRows = Object.entries(analytics.symptomsByType);
    if (symptomRows.length) {
      symptomRows.forEach(([type, stats]) => {
        const avg = stats.count ? (stats.severitySum / stats.count).toFixed(1) : "0";
        statLine(text.symptomLabels[type as keyof typeof text.symptomLabels] ?? type, `${stats.count}; ${text.severity}: avg ${avg}, max ${stats.maxSeverity}`);
      });
    } else empty();

    section(text.medicinesStatus);
    statLine(text.taken, analytics.medicines.taken);
    statLine(text.notTaken, analytics.medicines.notTaken);

    section(text.notesSummary);
    statLine(text.otherNotes, analytics.notes.count);

    if (aiSummary) {
      section(text.importantForVet);
      doc.font(font).fontSize(10).fillColor("#17202a").text(aiSummary, { width: pageWidth });
    }

    section(text.feeding);
    if (report.entries.feeding.length) {
      report.entries.feeding.forEach((entry) => line(entry.dateTime, [
        [text.foodType, text.foodLabels[entry.foodType] ?? entry.foodType],
        [text.amount, entry.amount],
        [text.comment, entry.note]
      ]));
    } else empty();

    section(text.symptoms);
    if (report.entries.symptoms.length) {
      report.entries.symptoms.forEach((entry) => line(entry.dateTime, [
        [text.symptomType, text.symptomLabels[entry.symptomType] ?? entry.symptomType],
        [text.severity, `${entry.severity}/5`],
        [text.comment, entry.note]
      ]));
    } else empty();

    section(text.medicines);
    if (report.entries.medicines.length) {
      report.entries.medicines.forEach((entry) => line(entry.dateTime, [
        [text.medicineName, entry.medicineName],
        [text.dosage, entry.dosage],
        [text.status, entry.taken ? text.taken : text.notTaken],
        [text.comment, entry.note]
      ]));
    } else empty();

    section(text.weight);
    if (report.entries.weights.length) {
      report.entries.weights.forEach((entry) => line(entry.date, [
        [text.weight, `${entry.weightKg.toString()} ${text.kg}`]
      ]));
    } else empty();

    section(text.notes);
    if (report.entries.notes.length) {
      report.entries.notes.forEach((entry) => line(entry.dateTime, [
        [text.notes, entry.note]
      ]));
    } else empty();

    doc.moveDown(1);
    doc.font(font).fontSize(9).fillColor("#8a91a0").text(text.disclaimer, { align: "left" });
    doc.end();
  });
}

router.get("/summary", async (req, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const formatOptions = reportFormatOptions(query, req.user!.languageCode);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const report = await buildReport(prisma, req.user!.id, query.petId, query.period);
    res.json(serialize({
      period: report.period,
      from: report.from,
      petName: report.petName,
      counts: report.counts,
      entries: report.entries,
      analytics: reportAnalytics(report),
      formatted: formattedReportSummary(report, formatOptions),
      recentNotes: report.entries.notes.slice(-10).reverse()
    }));
  } catch (error) {
    next(error);
  }
});

router.get("/exports/status", async (req, res, next) => {
  try {
    const count = await prisma.reportExport.count({ where: { userId: req.user!.id, dayKey: dayKey() } });
    res.json({ usedToday: count, limit: dailyExportLimit, remaining: Math.max(0, dailyExportLimit - count) });
  } catch (error) {
    next(error);
  }
});

router.get("/summary.pdf", async (req, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const formatOptions = reportFormatOptions(query, req.user!.languageCode);
    await assertPetBelongsToUser(query.petId, req.user!.id);

    const todayKey = dayKey();
    const report = await prisma.$transaction(async (tx) => {
      const usedToday = await tx.reportExport.count({ where: { userId: req.user!.id, dayKey: todayKey } });
      if (usedToday >= dailyExportLimit) {
        throw new HttpError(429, "REPORT_EXPORT_LIMIT_REACHED", "Daily report export limit reached.");
      }
      const built = await buildReport(tx, req.user!.id, query.petId, query.period);
      await tx.reportExport.create({ data: { userId: req.user!.id, petId: query.petId, period: query.period === "all" ? 0 : query.period, dayKey: todayKey } });
      return built;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });

    const body = await renderReportPdf(report, formatOptions);
    await trackAnalyticsEvent({
      userId: req.user!.id,
      event: "pdf_export_clicked",
      metadata: { petId: query.petId, period: query.period, timezone: formatOptions.timezone, locale: formatOptions.locale }
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="petcare-report-${query.period === "all" ? "all" : `${query.period}d`}.pdf"`);
    res.setHeader("Access-Control-Allow-Origin", "https://web.telegram.org");
    res.send(body);
  } catch (error) {
    next(error);
  }
});

export default router;
