import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

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

const feedingDraftSchema = z.object({
  dateTime: z.string().datetime(),
  foodType: z.enum(["DRY", "WET", "NATURAL", "TREAT", "OTHER"]),
  amount: z.string().min(1).max(80),
  note: z.string().max(1000).nullable()
}).strict();

const symptomDraftSchema = z.object({
  dateTime: z.string().datetime(),
  symptomType: z.enum(["VOMITING", "YELLOW_VOMIT", "NO_APPETITE", "DIARRHEA", "CONSTIPATION", "LETHARGY", "PAIN", "OTHER"]),
  severity: z.number().int().min(1).max(5),
  note: z.string().max(1000).nullable()
}).strict();

const weightDraftSchema = z.object({
  date: z.string().datetime(),
  weightKg: z.number().positive()
}).strict();

const noteDraftSchema = z.object({
  dateTime: z.string().datetime(),
  note: z.string().min(1).max(2000)
}).strict();

const unknownDraftSchema = z.object({}).strict();

const parsedCommandSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create_reminder"),
    target: z.literal("reminder").default("reminder"),
    confidence: z.number().min(0).max(1),
    draft: reminderDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("create_medicine_entry"),
    target: z.literal("diary").default("diary"),
    confidence: z.number().min(0).max(1),
    draft: medicineDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("create_feeding_entry"),
    target: z.literal("diary").default("diary"),
    confidence: z.number().min(0).max(1),
    draft: feedingDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("create_symptom_entry"),
    target: z.literal("diary").default("diary"),
    confidence: z.number().min(0).max(1),
    draft: symptomDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("create_weight_entry"),
    target: z.literal("diary").default("diary"),
    confidence: z.number().min(0).max(1),
    draft: weightDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("create_note"),
    target: z.literal("diary").default("diary"),
    confidence: z.number().min(0).max(1),
    draft: noteDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("unknown"),
    target: z.literal("unknown").default("unknown"),
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
const validIntents = new Set(["create_reminder", "create_medicine_entry", "create_feeding_entry", "create_symptom_entry", "create_weight_entry", "create_note", "unknown"]);
const reminderWords = /(напомни|напоминание|напомнить|поставь|создай напоминание|\bremind\b|\breminder\b|\bremind me\b|\balert\b|\brecu[eé]rdame\b|\brecordatorio\b|\bav[ií]same\b|\brappelle\b|\brappel\b|\berinnere\b|\berinnerung\b|提醒|提示)/i;
const noteWords = /(запиши заметк|заметк|запиши|note|nota|notiz|备注|笔记)/i;
const medicineWords = /(лекарств|таблет|сироп|капл|укол|дозиров|доза|\bmedicine\b|\bmedication\b|\bpill\b|\btablet\b|\bsyrup\b|\bdrops?\b|\binjection\b|\bdose\b|\bmedicina\b|\bmedicamento\b|\bpastilla\b|\bjarabe\b|\bgotas?\b|\binyecci[oó]n\b|\bdosis\b|\bm[eé]dicament\b|\bcomprim[eé]\b|\bsirop\b|\bgouttes?\b|\bpiq[uû]re\b|\bmedikament\b|\btablette\b|\btropfen\b|\bspritze\b|\bdosis\b|药|药片|药物|剂量|针)/i;
const feedingWords = /(корм|покорм|поел|ела|съел|съела|еда|кормление|\bfood\b|\bfeed\b|\bfed\b|\bate\b|\bmeal\b|comida|alimento|comi[oó]|comer|aliment[eé]|repas|nourri|nourrir|mang[eé]|futter|gef[uü]ttert|füttern|essen|gefressen|喂|吃|食物|粮|饭)/i;
const weightWords = /(вес|взвес|кг|килограмм|\bweight\b|\bweigh\b|\bkg\b|\bkilo\b|\bpeso\b|\bpes[eé]\b|\bpesar\b|\bpoids\b|\bpes[eé]e\b|\bgewicht\b|\bgewogen\b|\bwiegen\b|体重|称重|公斤|千克)/i;
const symptomWords = /(рвот|тошн|понос|диаре|запор|вял|боль|болит|не ест|нет аппетита|плохо ел|\bvomit|\bvomiting\b|\bdiarrhea\b|\bconstipation\b|\blethargy\b|\bpain\b|\bappetite\b|\bnot eating\b|\bno appetite\b|\bv[oó]mit|\bdiarrea\b|\bestreñimiento\b|\bletargo\b|\bdolor\b|\bsin apetito\b|\bno come\b|\bvomi|\bvomissements?\b|\bdiarrh[eé]e\b|\bconstipation\b|\bl[eé]thargie\b|\bdouleur\b|\bpas d.app[eé]tit\b|\berbrech|\berbroch|\bdurchfall\b|\bverstopfung\b|\btr[aä]gheit\b|\bschmerz\b|\bkein appetit\b|呕吐|吐|腹泻|便秘|没胃口|食欲|嗜睡|疼|痛)/i;
const vetWords = /(вет|ветеринар|\bvet\b|\bveterinarian\b|\bveterinario\b|\bveterinaria\b|\bv[eé]t[eé]rinaire\b|\btierarzt\b|兽医)/i;
const dryFoodWords = /(сух|dry|pienso seco|croquettes?|trocken|干粮)/i;
const wetFoodWords = /(влаж|wet|h[uú]med|p[aâ]t[eé]|nass|湿粮)/i;
const naturalFoodWords = /(натурал|natural|naturel|barf|天然)/i;
const treatFoodWords = /(лаком|treat|premio|friandise|leckerli|零食)/i;
const knownMedicineNames = ["антепсин", "antepsin", "омез", "omez", "энтеросгель", "enterosgel", "смекта", "smecta", "фортифлора", "fortiflora", "сукральфат", "sucralfate"];
const knownMedicineWords = new RegExp(knownMedicineNames.join("|"), "i");
const wordNumbers: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  cero: 0,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  zéro: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  sept: 7,
  huit: 8,
  neuf: 9,
  null: 0,
  eins: 1,
  ein: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  funf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9
};

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

function confidence(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace("%", "")) : NaN;
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
}

function isoDate(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

type WallDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function zonedParts(date: Date, timeZone: string): WallDateTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
    millisecond: date.getUTCMilliseconds()
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
  return asUtc - date.getTime();
}

function wallDateTimeToUtc(parts: WallDateTime, timeZone: string) {
  const wallUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
  let utc = wallUtc - timeZoneOffsetMs(new Date(wallUtc), timeZone);
  utc = wallUtc - timeZoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function addLocalDays(parts: WallDateTime, days: number): WallDateTime {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second, parts.millisecond));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond: date.getUTCMilliseconds()
  };
}

function wallDateTimeFromValue(value: unknown, fallback: string, timeZone: string): WallDateTime | null {
  const fallbackDate = new Date(fallback);
  if (Number.isNaN(fallbackDate.getTime())) return null;
  const fallbackParts = zonedParts(fallbackDate, timeZone);
  if (typeof value !== "string") return fallbackParts;

  const full = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?/);
  if (full) {
    return {
      year: Number(full[1]),
      month: Number(full[2]),
      day: Number(full[3]),
      hour: full[4] ? Number(full[4]) : 0,
      minute: full[5] ? Number(full[5]) : 0,
      second: full[6] ? Number(full[6]) : 0,
      millisecond: full[7] ? Number(full[7].padEnd(3, "0")) : 0
    };
  }

  const timeOnly = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeOnly) {
    return {
      ...fallbackParts,
      hour: Number(timeOnly[1]),
      minute: Number(timeOnly[2]),
      second: timeOnly[3] ? Number(timeOnly[3]) : 0,
      millisecond: 0
    };
  }

  return fallbackParts;
}

function localIsoDate(value: unknown, fallback: string, timeZone: string) {
  const parts = wallDateTimeFromValue(value, fallback, timeZone);
  if (!parts) return isoDate(value, fallback);
  return wallDateTimeToUtc(parts, timeZone).toISOString();
}

function reminderIsoDate(value: unknown, clientNow: string, timeZone: string) {
  const parts = wallDateTimeFromValue(value, clientNow, timeZone);
  const now = new Date(clientNow);
  if (!parts || Number.isNaN(now.getTime())) return isoDate(value, clientNow);

  let nextParts = parts;
  let next = wallDateTimeToUtc(nextParts, timeZone);
  let guard = 0;
  while (next <= now && guard < 370) {
    nextParts = addLocalDays(nextParts, 1);
    next = wallDateTimeToUtc(nextParts, timeZone);
    guard += 1;
  }
  return next.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(number) ? number : null;
}

function numberFromTranscript(transcript: string) {
  const digitDecimal = transcript.match(/(\d+)\s+(?:и|point|comma|coma|virgule|komma)\s+(\d+)/i);
  if (digitDecimal) return Number(`${digitDecimal[1]}.${digitDecimal[2]}`);

  const numericDecimal = transcript.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|кг|kilo|килограмм|公斤|千克)?/i);
  if (numericDecimal) return numberValue(numericDecimal[1]);

  const words = transcript.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  for (let index = 0; index < words.length - 2; index += 1) {
    const first = wordNumbers[words[index]];
    const separator = words[index + 1];
    const second = wordNumbers[words[index + 2]];
    if (first !== undefined && second !== undefined && ["point", "comma", "coma", "virgule", "komma"].includes(separator)) {
      return Number(`${first}.${second}`);
    }
  }

  return null;
}

function clampSeverity(value: unknown) {
  const number = Math.round(numberValue(value) ?? 1);
  return Math.max(1, Math.min(5, number));
}

function noteValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIntent(intent: string, transcript: string) {
  if (reminderWords.test(transcript)) return "create_reminder";
  if (noteWords.test(transcript)) return "create_note";
  if (intent === "create_reminder") return intent;
  if (weightWords.test(transcript)) return "create_weight_entry";
  if (symptomWords.test(transcript)) return "create_symptom_entry";
  if (medicineWords.test(transcript) || knownMedicineWords.test(transcript)) return "create_medicine_entry";
  if (feedingWords.test(transcript)) return "create_feeding_entry";
  return intent;
}

function reminderTypeFor(transcript: string, rawType: unknown) {
  const type = String(rawType);
  if (["FEEDING", "MEDICINE", "WEIGHT", "VET", "OTHER"].includes(type)) return type;
  if (medicineWords.test(transcript) || knownMedicineWords.test(transcript)) return "MEDICINE";
  if (feedingWords.test(transcript)) return "FEEDING";
  if (weightWords.test(transcript)) return "WEIGHT";
  if (vetWords.test(transcript)) return "VET";
  return "OTHER";
}

function medicineNameFromTranscript(transcript: string) {
  const normalized = transcript.toLowerCase();
  const match = knownMedicineNames.find((name) => normalized.includes(name.toLowerCase()));
  return match ?? null;
}

function foodTypeFor(transcript: string, rawType: unknown) {
  const type = String(rawType);
  if (["DRY", "WET", "NATURAL", "TREAT", "OTHER"].includes(type)) return type;
  if (dryFoodWords.test(transcript)) return "DRY";
  if (wetFoodWords.test(transcript)) return "WET";
  if (naturalFoodWords.test(transcript)) return "NATURAL";
  if (treatFoodWords.test(transcript)) return "TREAT";
  return "OTHER";
}

function symptomTypeFor(transcript: string, rawType: unknown) {
  const type = String(rawType);
  if (["VOMITING", "YELLOW_VOMIT", "NO_APPETITE", "DIARRHEA", "CONSTIPATION", "LETHARGY", "PAIN", "OTHER"].includes(type)) return type;
  if (/(желт.*рвот|yellow vomit|v[oó]mito amarillo|vomi jaune|gelb.*erbrechen|黄色.*吐|黄.*呕吐)/i.test(transcript)) return "YELLOW_VOMIT";
  if (/(рвот|тошн|\bvomit|\bv[oó]mit|vomi|vomissements?|erbrech|erbroch|呕吐|吐)/i.test(transcript)) return "VOMITING";
  if (/(нет аппетита|не ест|плохо ел|no appetite|not eating|sin apetito|no come|pas d.app[eé]tit|kein appetit|没胃口|食欲)/i.test(transcript)) return "NO_APPETITE";
  if (/(понос|диаре|diarrhea|diarrea|diarrh[eé]e|durchfall|腹泻)/i.test(transcript)) return "DIARRHEA";
  if (/(запор|constipation|estreñimiento|verstopfung|便秘)/i.test(transcript)) return "CONSTIPATION";
  if (/(вял|lethargy|letargo|l[eé]thargie|tr[aä]gheit|嗜睡)/i.test(transcript)) return "LETHARGY";
  if (/(боль|болит|pain|dolor|douleur|schmerz|疼|痛)/i.test(transcript)) return "PAIN";
  return "OTHER";
}

function normalizeParsedCommand(value: unknown, input: { clientNow: string; timezone: string; transcript: string }) {
  const record = asRecord(value);
  const rawIntent = typeof record.intent === "string" && validIntents.has(record.intent) ? record.intent : "unknown";
  const intent = normalizeIntent(rawIntent, input.transcript);
  const rawDraft = asRecord(record.draft);
  const warnings = Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === "string") : [];
  if (intent !== rawIntent) warnings.push("intent_corrected_by_backend_rules");
  const normalized = {
    intent,
    target: intent === "create_reminder" ? "reminder" : intent === "unknown" ? "unknown" : "diary",
    confidence: confidence(record.confidence),
    draft: {},
    warnings
  };

  if (intent === "create_reminder") {
    normalized.draft = {
      type: reminderTypeFor(input.transcript, rawDraft.type),
      title: typeof rawDraft.title === "string" && rawDraft.title.trim() ? rawDraft.title.trim() : "Voice reminder",
      time: reminderIsoDate(rawDraft.time, input.clientNow, input.timezone),
      repeatRule: ["daily", "weekly", "monthly"].includes(String(rawDraft.repeatRule)) ? rawDraft.repeatRule : null
    };
    return normalized;
  }

  if (intent === "create_medicine_entry") {
    const medicineName = typeof rawDraft.medicineName === "string" && rawDraft.medicineName.trim()
        ? rawDraft.medicineName.trim()
      : typeof rawDraft.name === "string" && rawDraft.name.trim()
        ? rawDraft.name.trim()
        : medicineNameFromTranscript(input.transcript) ?? input.transcript.slice(0, 120);
    normalized.draft = {
      medicineName,
      dosage: typeof rawDraft.dosage === "string" ? rawDraft.dosage : "",
      taken: typeof rawDraft.taken === "boolean" ? rawDraft.taken : true,
      dateTime: rawDraft.dateTime ?? rawDraft.time ? localIsoDate(rawDraft.dateTime ?? rawDraft.time, input.clientNow, input.timezone) : input.clientNow,
      note: typeof rawDraft.note === "string" ? rawDraft.note : null
    };
    return normalized;
  }

  if (intent === "create_feeding_entry") {
    normalized.draft = {
      dateTime: rawDraft.dateTime ?? rawDraft.time ? localIsoDate(rawDraft.dateTime ?? rawDraft.time, input.clientNow, input.timezone) : input.clientNow,
      foodType: foodTypeFor(input.transcript, rawDraft.foodType),
      amount: typeof rawDraft.amount === "string" && rawDraft.amount.trim() ? rawDraft.amount.trim() : "не указано",
      note: noteValue(rawDraft.note)
    };
    return normalized;
  }

  if (intent === "create_symptom_entry") {
    normalized.draft = {
      dateTime: rawDraft.dateTime ?? rawDraft.time ? localIsoDate(rawDraft.dateTime ?? rawDraft.time, input.clientNow, input.timezone) : input.clientNow,
      symptomType: symptomTypeFor(input.transcript, rawDraft.symptomType),
      severity: clampSeverity(rawDraft.severity),
      note: noteValue(rawDraft.note) ?? input.transcript
    };
    return normalized;
  }

  if (intent === "create_weight_entry") {
    const weightKg = numberValue(rawDraft.weightKg ?? rawDraft.weight) ?? numberFromTranscript(input.transcript);
    normalized.draft = {
      date: rawDraft.date ?? rawDraft.dateTime ?? rawDraft.time ? localIsoDate(rawDraft.date ?? rawDraft.dateTime ?? rawDraft.time, input.clientNow, input.timezone) : input.clientNow,
      weightKg: weightKg ?? 0
    };
    return normalized;
  }

  if (intent === "create_note") {
    normalized.draft = {
      dateTime: rawDraft.dateTime ?? rawDraft.time ? localIsoDate(rawDraft.dateTime ?? rawDraft.time, input.clientNow, input.timezone) : input.clientNow,
      note: typeof rawDraft.note === "string" && rawDraft.note.trim()
        ? rawDraft.note.trim()
        : typeof record.note === "string" && record.note.trim()
          ? record.note.trim()
          : input.transcript
    };
    return normalized;
  }

  normalized.draft = {};
  return normalized;
}

function fallbackUnknown(warnings: string[]): ParsedVoiceCommand {
  return {
    intent: "unknown",
    target: "unknown",
    confidence: 0,
    draft: {},
    warnings: Array.from(new Set(["parser_invalid_draft", ...warnings])).slice(0, 10)
  } as ParsedVoiceCommand;
}

function parserSystemPrompt() {
  return [
    "You parse short PetCare Diary voice command transcripts into strict JSON only.",
    "Supported transcript languages: Russian, English, Spanish, French, German, Chinese.",
    "Do not give medical advice. Do not invent medicine dosage if the user did not say it.",
    "Always return needsConfirmation outside this parser is true, so do not create database records.",
    "Supported intents: create_reminder, create_feeding_entry, create_medicine_entry, create_symptom_entry, create_weight_entry, create_note, unknown.",
    "Also return target: reminder for create_reminder, diary for diary entries, unknown for unknown.",
    "For create_reminder draft: type FEEDING/MEDICINE/WEIGHT/VET/OTHER, title, time ISO string, repeatRule null/daily/weekly/monthly.",
    "For create_feeding_entry draft: dateTime ISO string, foodType DRY/WET/NATURAL/TREAT/OTHER, amount string, note null or string.",
    "For create_medicine_entry draft: medicineName, dosage, taken, dateTime ISO string, note null or string.",
    "For create_symptom_entry draft: dateTime ISO string, symptomType VOMITING/YELLOW_VOMIT/NO_APPETITE/DIARRHEA/CONSTIPATION/LETHARGY/PAIN/OTHER, severity 1-5, note null or string.",
    "For create_weight_entry draft: date ISO string, weightKg number.",
    "For create_note draft: dateTime ISO string, note.",
    "Rules:",
    "- If transcript asks to remind, use create_reminder even when it mentions feeding/medicine/weight.",
    "- Reminder phrases include: remind me, recuérdame/avísame, rappelle-moi/rappel, erinnere mich/Erinnerung, 提醒.",
    "- Explicit note phrases include: note/write note, nota, note, Notiz, 备注. If present, prefer create_note unless it asks to remind.",
    "- If transcript says something happened/done/given/eaten, use a diary entry, not a reminder.",
    "- If user says a medicine was given/taken, use create_medicine_entry with taken=true.",
    "- If user says feeding happened, use create_feeding_entry.",
    "- If user says weight was measured, use create_weight_entry.",
    "- If user says vomiting/diarrhea/no appetite/lethargy/pain, use create_symptom_entry unless it is just a general note.",
    "- If medicine command has no time, use clientNow.",
    "- If reminder has no date, choose the nearest future time relative to clientNow in the provided timezone.",
    "- If reminder time is ambiguous, add warning or return unknown.",
    "- Preserve user-provided comments in note fields.",
    "- For unknown or unsafe medical advice requests, return intent unknown.",
    "Examples:",
    "напомни покормить в 5 => create_reminder, target reminder, type FEEDING",
    "remind me to feed at 5 => create_reminder, target reminder, type FEEDING",
    "recuérdame darle medicina a las 5 => create_reminder, target reminder, type MEDICINE",
    "rappelle-moi de le nourrir à 17h => create_reminder, target reminder, type FEEDING",
    "erinnere mich um 5 ans Füttern => create_reminder, target reminder, type FEEDING",
    "提醒我五点喂食 => create_reminder, target reminder, type FEEDING",
    "покормил влажным кормом утром => create_feeding_entry, target diary",
    "fed wet food this morning => create_feeding_entry, target diary",
    "comió comida húmeda por la mañana => create_feeding_entry, target diary",
    "a mangé de la pâtée ce matin => create_feeding_entry, target diary",
    "heute Morgen Nassfutter gefressen => create_feeding_entry, target diary",
    "早上吃了湿粮 => create_feeding_entry, target diary",
    "дал лекарство антепсин => create_medicine_entry, target diary, dosage empty",
    "gave medicine antepsin => create_medicine_entry, target diary, dosage empty",
    "di medicina antepsin => create_medicine_entry, target diary, dosage empty",
    "médicament donné antepsin => create_medicine_entry, target diary, dosage empty",
    "Medikament Antepsin gegeben => create_medicine_entry, target diary, dosage empty",
    "给了药 antepsin => create_medicine_entry, target diary, dosage empty",
    "напомни дать антепсин в 5 => create_reminder, target reminder, type MEDICINE",
    "рвота утром два раза => create_symptom_entry, target diary, symptomType VOMITING",
    "vomited twice this morning => create_symptom_entry, target diary, symptomType VOMITING",
    "vómito dos veces por la mañana => create_symptom_entry, target diary, symptomType VOMITING",
    "vomissements deux fois ce matin => create_symptom_entry, target diary, symptomType VOMITING",
    "zweimal erbrochen heute Morgen => create_symptom_entry, target diary, symptomType VOMITING",
    "早上吐了两次 => create_symptom_entry, target diary, symptomType VOMITING",
    "вес 4.2 кг => create_weight_entry, target diary",
    "weight 4.2 kg => create_weight_entry, target diary",
    "peso 4.2 kg => create_weight_entry, target diary",
    "poids 4.2 kg => create_weight_entry, target diary",
    "Gewicht 4.2 kg => create_weight_entry, target diary",
    "体重4.2公斤 => create_weight_entry, target diary",
    "запиши заметку плохо ел утром => create_note, target diary",
    "Return exactly this JSON shape with no Markdown:",
    "{\"intent\":\"create_reminder|create_feeding_entry|create_medicine_entry|create_symptom_entry|create_weight_entry|create_note|unknown\",\"target\":\"reminder|diary|unknown\",\"confidence\":0.0,\"draft\":{},\"warnings\":[]}"
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
  const normalizedJson = normalizeParsedCommand(json, { clientNow: input.clientNow, timezone: input.timezone, transcript: input.transcript });
  const parsedCommand = parsedCommandSchema.safeParse(normalizedJson);
  if (!parsedCommand.success) {
    if (env.NODE_ENV !== "production") {
      console.warn(JSON.stringify({
        event: "voice_parser_invalid_draft",
        issues: parsedCommand.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code }))
      }));
    }
    return fallbackUnknown(normalizedJson.warnings);
  }

  return parsedCommand.data;
}
