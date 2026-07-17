import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const reminderDraftSchema = z.object({
  type: z.enum(["FEEDING", "MEDICINE", "WATER", "WEIGHT", "VET", "VACCINATION", "OTHER"]),
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

const waterDraftSchema = z.object({
  dateTime: z.string().datetime(),
  amountMl: z.number().int().positive().max(50_000),
  note: z.string().max(1000).nullable()
}).strict();

const vaccinationDraftSchema = z.object({
  procedureType: z.enum(["VACCINE", "DEWORMING", "FLEA_TICK", "OTHER"]),
  title: z.string().min(1).max(160),
  date: z.string().datetime(),
  nextDueDate: z.string().datetime().nullable(),
  note: z.string().max(1000).nullable(),
  createReminder: z.boolean()
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
    intent: z.literal("create_water_entry"),
    target: z.literal("diary").default("diary"),
    confidence: z.number().min(0).max(1),
    draft: waterDraftSchema,
    warnings: z.array(z.string().max(240)).max(10).default([])
  }).strict(),
  z.object({
    intent: z.literal("create_vaccination_entry"),
    target: z.literal("diary").default("diary"),
    confidence: z.number().min(0).max(1),
    draft: vaccinationDraftSchema,
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
const validIntents = new Set(["create_reminder", "create_medicine_entry", "create_feeding_entry", "create_symptom_entry", "create_weight_entry", "create_note", "create_water_entry", "create_vaccination_entry", "unknown"]);
const reminderWords = /(напомни|напоминание|напомнить|поставь|создай напоминание|\bremind\b|\breminder\b|\bremind me\b|\balert\b|\brecu[eé]rdame\b|\brecordatorio\b|\bav[ií]same\b|\brappelle\b|\brappel\b|\berinnere\b|\berinnerung\b|提醒|提示)/i;
const noteWords = /(запиши заметк|заметк|\bnote\b|\bnota\b|\bnotiz\b|备注|笔记)/i;
const medicineWords = /(лекарств|таблет|сироп|капл|укол|дозиров|доза|\bmedicine\b|\bmedication\b|\bpill\b|\btablet\b|\bsyrup\b|\bdrops?\b|\binjection\b|\bdose\b|\bmedicina\b|\bmedicamento\b|\bpastilla\b|\bjarabe\b|\bgotas?\b|\binyecci[oó]n\b|\bdosis\b|\bm[eé]dicament\b|\bcomprim[eé]\b|\bsirop\b|\bgouttes?\b|\bpiq[uû]re\b|\bmedikament\b|\btablette\b|\btropfen\b|\bspritze\b|\bdosis\b|药|药片|药物|剂量|针)/i;
const feedingWords = /(корм|покорм|поел|ела|съел|съела|еда|кормление|\bfood\b|\bfeed\b|\bfed\b|\bate\b|\bmeal\b|comida|alimento|comi[oó]|comer|aliment[eé]|repas|nourri|nourrir|mang[eé]|futter|gef[uü]ttert|füttern|essen|gefressen|喂|吃|食物|粮|饭)/i;
const waterWords = /(вод|пить|попить|поить|\bwater\b|\bdrink\b|\bdrinking\b|agua|beber|boire|\beau\b|wasser|trinken|水|喝水|饮水)/i;
const weightWords = /(вес|взвес|кг|килограмм|\bweight\b|\bweigh\b|\bkg\b|\bkilo\b|\bpeso\b|\bpes[eé]\b|\bpesar\b|\bpoids\b|\bpes[eé]e\b|\bgewicht\b|\bgewogen\b|\bwiegen\b|体重|称重|公斤|千克)/i;
const symptomWords = /(рвот|тошн|понос|диаре|запор|вял|боль|болит|не ест|нет аппетита|плохо ел|\bvomit|\bvomiting\b|\bdiarrhea\b|\bconstipation\b|\blethargy\b|\bpain\b|\bappetite\b|\bnot eating\b|\bno appetite\b|\bv[oó]mit|\bdiarrea\b|\bestreñimiento\b|\bletargo\b|\bdolor\b|\bsin apetito\b|\bno come\b|\bvomi|\bvomissements?\b|\bdiarrh[eé]e\b|\bconstipation\b|\bl[eé]thargie\b|\bdouleur\b|\bpas d.app[eé]tit\b|\berbrech|\berbroch|\bdurchfall\b|\bverstopfung\b|\btr[aä]gheit\b|\bschmerz\b|\bkein appetit\b|呕吐|吐|腹泻|便秘|没胃口|食欲|嗜睡|疼|痛)/i;
const vetWords = /(вет|ветеринар|\bvet\b|\bveterinarian\b|\bveterinario\b|\bveterinaria\b|\bv[eé]t[eé]rinaire\b|\btierarzt\b|兽医)/i;
const vaccinationWords = /(вакцин|привив|обработк|дегельмин|глист|блох|клещ|\bvaccin|\bshot\b|\bdeworm|\bflea\b|\btick\b|\btreatment\b|vacuna|desparasit|pulgas?|garrapatas?|vaccin|vermifuge|puces?|tiques?|impf|entwurmung|floh|zecke|疫苗|驱虫|跳蚤|蜱)/i;
const waterVolumeWords = /(\d+(?:[.,]\d+)?\s*(?:мл|миллилитр|ml|millilit|毫升))/i;
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
  ten: 10,
  eleven: 11,
  twelve: 12,
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
  diez: 10,
  once: 11,
  doce: 12,
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
  dix: 10,
  onze: 11,
  douze: 12,
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
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  zwolf: 12,
  ноль: 0,
  один: 1,
  одна: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  час: 1
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

type WallDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

type ParserProvider = {
  apiKey: string;
  model: string;
  supportsStrictSchema: boolean;
  url: string;
  tokenLimitField: "max_completion_tokens" | "max_tokens";
};

function voiceParserProviders(): ParserProvider[] {
  if (env.OPENROUTER_STT_PARSER) {
    const apiKey = env.OPENROUTER_STT_PARSER;
    const models = Array.from(new Set([
      env.OPENROUTER_STT_MODEL_PARSER,
      env.OPENROUTER_STT_MODEL_PARSER_FALLBACK
    ]));
    return models.map((model) => ({
      apiKey,
      model,
      supportsStrictSchema: true,
      url: "https://openrouter.ai/api/v1/chat/completions",
      tokenLimitField: "max_tokens"
    }));
  }

  if (env.MINIMAX_API_KEY) {
    return [{
      apiKey: env.MINIMAX_API_KEY,
      model: env.MINIMAX_PARSER_MODEL,
      supportsStrictSchema: false,
      url: `${env.MINIMAX_API_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`,
      tokenLimitField: "max_completion_tokens"
    }];
  }

  throw new HttpError(422, "VOICE_PARSE_FAILED", "Voice command parser provider is not configured.");
}

const voiceCommandJsonSchema = {
  name: "petcare_voice_command",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intent", "target", "confidence", "draft", "warnings"],
    properties: {
      intent: {
        type: "string",
        enum: ["create_reminder", "create_feeding_entry", "create_medicine_entry", "create_symptom_entry", "create_weight_entry", "create_note", "create_water_entry", "create_vaccination_entry", "unknown"]
      },
      target: { type: "string", enum: ["reminder", "diary", "unknown"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      draft: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["FEEDING", "MEDICINE", "WATER", "WEIGHT", "VET", "VACCINATION", "OTHER"] },
          title: { type: "string", maxLength: 160 },
          repeatRule: { type: ["string", "null"], enum: ["daily", "weekly", "monthly", null] },
          foodType: { type: "string", enum: ["DRY", "WET", "NATURAL", "TREAT", "OTHER"] },
          amount: { type: "string", maxLength: 80 },
          note: { type: ["string", "null"], maxLength: 2000 },
          medicineName: { type: "string", maxLength: 120 },
          dosage: { type: "string", maxLength: 80 },
          taken: { type: "boolean" },
          symptomType: { type: "string", enum: ["VOMITING", "YELLOW_VOMIT", "NO_APPETITE", "DIARRHEA", "CONSTIPATION", "LETHARGY", "PAIN", "OTHER"] },
          severity: { type: "integer", minimum: 1, maximum: 5 },
          weightKg: { type: "number", exclusiveMinimum: 0 },
          amountMl: { type: "integer", minimum: 1, maximum: 50000 },
          procedureType: { type: "string", enum: ["VACCINE", "DEWORMING", "FLEA_TICK", "OTHER"] },
          nextDueDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          createReminder: { type: "boolean" },
          localDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          localTime: { type: ["string", "null"], pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
          hasExplicitDate: { type: "boolean" },
          hasExplicitTime: { type: "boolean" }
        }
      },
      warnings: {
        type: "array",
        maxItems: 10,
        items: { type: "string", maxLength: 240 }
      }
    }
  }
} as const;

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

function localDateString(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function localTimeString(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function rawLocalDate(rawDraft: Record<string, unknown>) {
  if (rawDraft.hasExplicitDate !== true) return null;
  const direct = localDateString(rawDraft.localDate);
  if (direct) return direct;
  return localDateString(rawDraft.date) ?? localDateString(rawDraft.dateTime) ?? localDateString(rawDraft.time);
}

function rawLocalTime(rawDraft: Record<string, unknown>) {
  if (rawDraft.hasExplicitTime !== true) return null;
  return localTimeString(rawDraft.localTime);
}

function localDateTimeToUtcIso(input: { localDate?: string | null; localTime?: string | null; clientNow: string; timezone: string }) {
  const now = new Date(input.clientNow);
  if (Number.isNaN(now.getTime())) return input.clientNow;
  const fallbackParts = zonedParts(now, input.timezone);
  const date = input.localDate?.split("-").map(Number);
  const time = input.localTime?.split(":").map(Number);
  const parts: WallDateTime = {
    year: date?.[0] ?? fallbackParts.year,
    month: date?.[1] ?? fallbackParts.month,
    day: date?.[2] ?? fallbackParts.day,
    hour: time?.[0] ?? fallbackParts.hour,
    minute: time?.[1] ?? fallbackParts.minute,
    second: 0,
    millisecond: 0
  };
  return wallDateTimeToUtc(parts, input.timezone).toISOString();
}

function diaryIsoDateFromTemporal(input: {
  rawDraft: Record<string, unknown>;
  clientNow: string;
  timezone: string;
  explicitTime: string | null;
}) {
  const localDate = rawLocalDate(input.rawDraft);
  if (input.explicitTime) {
    return localDateTimeToUtcIso({
      localDate,
      localTime: input.explicitTime,
      clientNow: input.clientNow,
      timezone: input.timezone
    });
  }
  if (localDate) {
    return localDateTimeToUtcIso({
      localDate,
      clientNow: input.clientNow,
      timezone: input.timezone
    });
  }
  return input.clientNow;
}

function reminderIsoDateFromTemporal(input: {
  rawDraft: Record<string, unknown>;
  clientNow: string;
  timezone: string;
  explicitTime: string | null;
}) {
  const now = new Date(input.clientNow);
  if (Number.isNaN(now.getTime())) return input.clientNow;
  const localDate = rawLocalDate(input.rawDraft);
  const localTime = input.explicitTime ?? rawLocalTime(input.rawDraft);
  let nextParts = wallDateTimeFromValue(localTime, input.clientNow, input.timezone);
  if (!nextParts) return input.clientNow;
  if (localDate) {
    const [year, month, day] = localDate.split("-").map(Number);
    nextParts = { ...nextParts, year, month, day };
  }

  let next = wallDateTimeToUtc(nextParts, input.timezone);
  if (!localDate) {
    let guard = 0;
    while (next <= now && guard < 370) {
      nextParts = addLocalDays(nextParts, 1);
      next = wallDateTimeToUtc(nextParts, input.timezone);
      guard += 1;
    }
  }
  return next.toISOString();
}

function chineseHour(value: string) {
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (digits[value[1]] ?? 0);
  if (value.endsWith("十")) return (digits[value[0]] ?? 0) * 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (digits[tens] ?? 0) * 10 + (digits[ones] ?? 0);
  }
  return digits[value] ?? null;
}

function hasExplicitDaypart(transcript: string) {
  return /(am\b|pm\b|ноч|ночи|утр|вечер|вечера|дн[её]м|дня|morning|afternoon|evening|tonight|mañana|tarde|noche|matin|soir|nuit|morgen|abend|nacht|上午|早上|下午|晚上|夜|凌晨)/i.test(transcript);
}

function normalizeSpokenHour(hour: number, transcript: string) {
  if (/(pm\b|вечер|вечера|дн[её]м|дня|afternoon|evening|tarde|soir|abend|下午|晚上)/i.test(transcript) && hour >= 1 && hour <= 11) {
    return hour + 12;
  }
  if (/(am\b|ноч|ночи|утр|morning|mañana|matin|morgen|上午|早上)/i.test(transcript) && hour === 12) return 0;
  return hour;
}

function latestPastAmbiguousDiaryTime(spokenTime: string | null, input: { clientNow: string; timezone: string; transcript: string }) {
  if (!spokenTime || hasExplicitDaypart(input.transcript)) return spokenTime;
  const [hourRaw, minuteRaw] = spokenTime.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 11) return spokenTime;

  const now = new Date(input.clientNow);
  if (Number.isNaN(now.getTime())) return spokenTime;
  const nowParts = zonedParts(now, input.timezone);
  const currentMinutes = nowParts.hour * 60 + nowParts.minute;
  const morningMinutes = hour * 60 + minute;
  const afternoonMinutes = (hour + 12) * 60 + minute;
  if (afternoonMinutes <= currentMinutes) return `${String(hour + 12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (morningMinutes <= currentMinutes) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return spokenTime;
}

function nearestFutureAmbiguousReminderTime(spokenTime: string | null, input: { clientNow: string; timezone: string; transcript: string }) {
  if (!spokenTime || hasExplicitDaypart(input.transcript)) return spokenTime;
  const [hourRaw, minuteRaw] = spokenTime.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 11) return spokenTime;

  const now = new Date(input.clientNow);
  if (Number.isNaN(now.getTime())) return spokenTime;
  const nowParts = zonedParts(now, input.timezone);
  const currentMinutes = nowParts.hour * 60 + nowParts.minute;
  const morningMinutes = hour * 60 + minute;
  const afternoonMinutes = (hour + 12) * 60 + minute;
  if (morningMinutes > currentMinutes) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (afternoonMinutes > currentMinutes) return `${String(hour + 12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function spokenTimeFromTranscript(transcript: string) {
  const numeric = transcript.match(/(?:^|[^\p{L}\p{N}])(?:at|around|в|во|к|a\s+las|à|um)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm|час(?:а|ов)?|h)?(?:$|[^\p{L}\p{N}])/iu);
  if (numeric) {
    const hour = normalizeSpokenHour(Number(numeric[1]), transcript);
    const minute = numeric[2] ? Number(numeric[2]) : 0;
    if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const word = transcript.match(/(?:^|[^\p{L}\p{N}])(?:at|around|в|во|к|a\s+las|à|um)\s+([\p{L}]+)(?:\s+(?:o'clock|час(?:а|ов)?|h))?(?:$|[^\p{L}\p{N}])/iu);
  if (word) {
    const rawHour = wordNumbers[word[1].toLowerCase()];
    if (rawHour !== undefined) {
      const hour = normalizeSpokenHour(rawHour, transcript);
      if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  const chineseNumeric = transcript.match(/(\d{1,2})(?::([0-5]\d))?\s*(?:点|点钟|時|时)/u);
  if (chineseNumeric) {
    const hour = normalizeSpokenHour(Number(chineseNumeric[1]), transcript);
    const minute = chineseNumeric[2] ? Number(chineseNumeric[2]) : 0;
    if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const chinese = transcript.match(/([一二两三四五六七八九十]{1,3})\s*(?:点|点钟|時|时)/u);
  if (chinese) {
    const rawHour = chineseHour(chinese[1]);
    if (rawHour !== null) {
      const hour = normalizeSpokenHour(rawHour, transcript);
      if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  return null;
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
  if (vaccinationWords.test(transcript)) return "create_vaccination_entry";
  if (waterWords.test(transcript) && waterVolumeWords.test(transcript)) return "create_water_entry";
  if (feedingWords.test(transcript)) return "create_feeding_entry";
  return intent;
}

function reminderTypeFor(transcript: string, rawType: unknown) {
  const type = String(rawType);
  if (["FEEDING", "MEDICINE", "WATER", "WEIGHT", "VET", "VACCINATION", "OTHER"].includes(type)) return type;
  if (medicineWords.test(transcript) || knownMedicineWords.test(transcript)) return "MEDICINE";
  if (feedingWords.test(transcript)) return "FEEDING";
  if (waterWords.test(transcript)) return "WATER";
  if (weightWords.test(transcript)) return "WEIGHT";
  if (vaccinationWords.test(transcript)) return "VACCINATION";
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

function waterAmountFromTranscript(transcript: string) {
  const match = transcript.match(/(\d+(?:[.,]\d+)?)\s*(?:мл|миллилитр(?:а|ов)?|ml|millilit(?:er|ers|re|res|ro|ros)?|毫升)/i);
  return match ? numberValue(match[1]) : null;
}

function vaccinationProcedureTypeFor(transcript: string, rawType: unknown) {
  const type = String(rawType);
  if (["VACCINE", "DEWORMING", "FLEA_TICK", "OTHER"].includes(type)) return type;
  if (/(дегельмин|глист|\bdeworm|desparasit|vermifuge|entwurm|驱虫)/i.test(transcript)) return "DEWORMING";
  if (/(блох|клещ|\bflea\b|\btick\b|pulgas?|garrapatas?|puces?|tiques?|floh|zecke|跳蚤|蜱)/i.test(transcript)) return "FLEA_TICK";
  if (/(вакцин|привив|\bvaccin|\bshot\b|vacuna|impf|疫苗)/i.test(transcript)) return "VACCINE";
  return "OTHER";
}

function normalizeParsedCommand(value: unknown, input: { clientNow: string; timezone: string; transcript: string }) {
  const record = asRecord(value);
  const rawIntent = typeof record.intent === "string" && validIntents.has(record.intent) ? record.intent : "unknown";
  const intent = normalizeIntent(rawIntent, input.transcript);
  const rawDraft = asRecord(record.draft);
  const warnings = Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === "string") : [];
  const spokenTime = spokenTimeFromTranscript(input.transcript);
  const modelLocalTime = rawLocalTime(rawDraft);
  const explicitDiaryTime = modelLocalTime
    ? latestPastAmbiguousDiaryTime(modelLocalTime, input)
    : latestPastAmbiguousDiaryTime(spokenTime, input);
  const explicitReminderTime = modelLocalTime
    ? nearestFutureAmbiguousReminderTime(modelLocalTime, input)
    : nearestFutureAmbiguousReminderTime(spokenTime, input);
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
      time: reminderIsoDateFromTemporal({
        rawDraft,
        clientNow: input.clientNow,
        timezone: input.timezone,
        explicitTime: explicitReminderTime
      }),
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
      dateTime: diaryIsoDateFromTemporal({
        rawDraft,
        clientNow: input.clientNow,
        timezone: input.timezone,
        explicitTime: explicitDiaryTime
      }),
      note: typeof rawDraft.note === "string" ? rawDraft.note : null
    };
    return normalized;
  }

  if (intent === "create_feeding_entry") {
    normalized.draft = {
      dateTime: diaryIsoDateFromTemporal({
        rawDraft,
        clientNow: input.clientNow,
        timezone: input.timezone,
        explicitTime: explicitDiaryTime
      }),
      foodType: foodTypeFor(input.transcript, rawDraft.foodType),
      amount: typeof rawDraft.amount === "string" && rawDraft.amount.trim() ? rawDraft.amount.trim() : "не указано",
      note: noteValue(rawDraft.note)
    };
    return normalized;
  }

  if (intent === "create_symptom_entry") {
    normalized.draft = {
      dateTime: diaryIsoDateFromTemporal({
        rawDraft,
        clientNow: input.clientNow,
        timezone: input.timezone,
        explicitTime: explicitDiaryTime
      }),
      symptomType: symptomTypeFor(input.transcript, rawDraft.symptomType),
      severity: clampSeverity(rawDraft.severity),
      note: noteValue(rawDraft.note) ?? input.transcript
    };
    return normalized;
  }

  if (intent === "create_weight_entry") {
    const weightKg = numberValue(rawDraft.weightKg ?? rawDraft.weight) ?? numberFromTranscript(input.transcript);
    normalized.draft = {
      date: diaryIsoDateFromTemporal({
        rawDraft,
        clientNow: input.clientNow,
        timezone: input.timezone,
        explicitTime: explicitDiaryTime
      }),
      weightKg: weightKg ?? 0
    };
    return normalized;
  }

  if (intent === "create_note") {
    normalized.draft = {
      dateTime: diaryIsoDateFromTemporal({
        rawDraft,
        clientNow: input.clientNow,
        timezone: input.timezone,
        explicitTime: explicitDiaryTime
      }),
      note: typeof rawDraft.note === "string" && rawDraft.note.trim()
        ? rawDraft.note.trim()
        : typeof record.note === "string" && record.note.trim()
          ? record.note.trim()
          : input.transcript
    };
    return normalized;
  }

  if (intent === "create_water_entry") {
    const amountMl = numberValue(rawDraft.amountMl) ?? waterAmountFromTranscript(input.transcript);
    if (amountMl === null || amountMl <= 0) {
      return {
        intent: "unknown",
        target: "unknown",
        confidence: confidence(record.confidence),
        draft: {},
        warnings: [...warnings, "water_amount_missing"]
      };
    }
    normalized.draft = {
      dateTime: diaryIsoDateFromTemporal({
        rawDraft,
        clientNow: input.clientNow,
        timezone: input.timezone,
        explicitTime: explicitDiaryTime
      }),
      amountMl: Math.round(amountMl),
      note: noteValue(rawDraft.note)
    };
    return normalized;
  }

  if (intent === "create_vaccination_entry") {
    const nextDueLocalDate = localDateString(rawDraft.nextDueDate);
    const nextDueDate = nextDueLocalDate
      ? localDateTimeToUtcIso({ localDate: nextDueLocalDate, clientNow: input.clientNow, timezone: input.timezone })
      : null;
    normalized.draft = {
      procedureType: vaccinationProcedureTypeFor(input.transcript, rawDraft.procedureType),
      title: typeof rawDraft.title === "string" && rawDraft.title.trim()
        ? rawDraft.title.trim()
        : input.transcript.slice(0, 160),
      date: diaryIsoDateFromTemporal({
        rawDraft,
        clientNow: input.clientNow,
        timezone: input.timezone,
        explicitTime: explicitDiaryTime
      }),
      nextDueDate,
      note: noteValue(rawDraft.note),
      createReminder: Boolean(nextDueDate && rawDraft.createReminder === true)
    };
    return normalized;
  }

  normalized.draft = {};
  return normalized;
}

function temporalDraftValue(draft: Record<string, unknown>, key: string) {
  const value = draft[key];
  return typeof value === "string" || typeof value === "boolean" || value === null ? value : undefined;
}

function normalizedTemporalValue(command: { intent?: unknown; draft?: unknown }) {
  const draft = asRecord(command.draft);
  if (command.intent === "create_reminder") return temporalDraftValue(draft, "time");
  if (command.intent === "create_weight_entry") return temporalDraftValue(draft, "date");
  if (command.intent === "create_vaccination_entry") return temporalDraftValue(draft, "date");
  return temporalDraftValue(draft, "dateTime");
}

function logVoiceParserTemporalDebug(input: {
  transcript: string;
  clientNow: string;
  timezone: string;
  debug?: { requestId?: string; userId?: string; logTranscript?: boolean };
  raw: unknown;
  normalized: unknown;
}) {
  if (!env.VOICE_PARSER_DEBUG_LOGS || !input.debug?.logTranscript) return;
  const rawRecord = asRecord(input.raw);
  const rawDraft = asRecord(rawRecord.draft);
  const normalizedRecord = asRecord(input.normalized);
  console.info(JSON.stringify({
    event: "voice_parser_temporal_debug",
    requestId: input.debug.requestId,
    userId: input.debug.userId,
    transcript: input.transcript,
    timezone: input.timezone,
    clientNow: input.clientNow,
    intent: normalizedRecord.intent,
    target: normalizedRecord.target,
    rawIntent: rawRecord.intent,
    rawTarget: rawRecord.target,
    rawDraftDateTime: temporalDraftValue(rawDraft, "dateTime"),
    rawDraftTime: temporalDraftValue(rawDraft, "time"),
    rawDraftDate: temporalDraftValue(rawDraft, "date"),
    rawDraftLocalDate: temporalDraftValue(rawDraft, "localDate"),
    rawDraftLocalTime: temporalDraftValue(rawDraft, "localTime"),
    rawDraftHasExplicitDate: temporalDraftValue(rawDraft, "hasExplicitDate"),
    rawDraftHasExplicitTime: temporalDraftValue(rawDraft, "hasExplicitTime"),
    normalizedTemporal: normalizedTemporalValue(normalizedRecord)
  }));
}

function parserSystemPrompt() {
  return [
    "You parse short PetCare Diary voice command transcripts into strict JSON only.",
    "Supported transcript languages: Russian, English, Spanish, French, German, Chinese.",
    "Do not give medical advice. Do not invent medicine dosage if the user did not say it.",
    "Always return needsConfirmation outside this parser is true, so do not create database records.",
    "Supported intents: create_reminder, create_feeding_entry, create_medicine_entry, create_symptom_entry, create_weight_entry, create_note, create_water_entry, create_vaccination_entry, unknown.",
    "Also return target: reminder for create_reminder, diary for diary entries, unknown for unknown.",
    "For create_reminder draft: type FEEDING/MEDICINE/WATER/WEIGHT/VET/VACCINATION/OTHER, title, repeatRule null/daily/weekly/monthly, plus localDate YYYY-MM-DD or null, localTime HH:mm or null, hasExplicitDate boolean, hasExplicitTime boolean.",
    "For create_feeding_entry draft: foodType DRY/WET/NATURAL/TREAT/OTHER, amount string, note null or string, plus localDate/localTime/hasExplicitDate/hasExplicitTime.",
    "For create_medicine_entry draft: medicineName, dosage, taken, note null or string, plus localDate/localTime/hasExplicitDate/hasExplicitTime.",
    "For create_symptom_entry draft: symptomType VOMITING/YELLOW_VOMIT/NO_APPETITE/DIARRHEA/CONSTIPATION/LETHARGY/PAIN/OTHER, severity 1-5, note null or string, plus localDate/localTime/hasExplicitDate/hasExplicitTime.",
    "For create_weight_entry draft: weightKg number, plus localDate/localTime/hasExplicitDate/hasExplicitTime.",
    "For create_note draft: note, plus localDate/localTime/hasExplicitDate/hasExplicitTime.",
    "For create_water_entry draft: amountMl integer, note null or string, plus localDate/localTime/hasExplicitDate/hasExplicitTime.",
    "For create_vaccination_entry draft: procedureType VACCINE/DEWORMING/FLEA_TICK/OTHER, title, note null or string, nextDueDate YYYY-MM-DD or null, createReminder boolean, plus localDate/localTime/hasExplicitDate/hasExplicitTime.",
    "Rules:",
    "- Interpret all dates/times as local wall-clock components in the provided timezone. Do not convert them to UTC yourself.",
    "- If user says an explicit local time, put only that local wall-clock time in localTime, for example one in the afternoon => 13:00, 18:00 => 18:00.",
    "- You are responsible for normalizing conversational time expressions across supported languages into localTime HH:mm.",
    "- Russian examples: пятнадцать минут первого => 12:15, без двадцати час => 12:40, полвторого => 13:30.",
    "- English examples: quarter past one => 01:15 or 13:15 by context, twenty to one => 00:40 or 12:40 by context, half past two => 02:30 or 14:30 by context.",
    "- Spanish examples: una y cuarto => 01:15 or 13:15 by context, una menos veinte => 00:40 or 12:40 by context, dos y media => 02:30 or 14:30 by context.",
    "- French examples: une heure et quart => 01:15 or 13:15 by context, une heure moins vingt => 00:40 or 12:40 by context, deux heures et demie => 02:30 or 14:30 by context.",
    "- German examples: Viertel nach eins => 01:15 or 13:15 by context, zwanzig vor eins => 00:40 or 12:40 by context, halb zwei => 01:30 or 13:30 by context.",
    "- Chinese examples: 一点一刻 => 01:15 or 13:15 by context, 差二十点一点 => 00:40 or 12:40 by context, 两点半 => 02:30 or 14:30 by context.",
    "- If user says an explicit date or relative day, put the resulting local calendar date in localDate and hasExplicitDate=true.",
    "- If user does not say an explicit date, set localDate=null and hasExplicitDate=false.",
    "- If user does not say an explicit time, set localTime=null and hasExplicitTime=false.",
    "- If transcript asks to remind, use create_reminder even when it mentions feeding/medicine/water/weight/vaccination.",
    "- Reminder phrases include: remind me, recuérdame/avísame, rappelle-moi/rappel, erinnere mich/Erinnerung, 提醒.",
    "- Explicit note phrases include: note/write note, nota, note, Notiz, 备注. If present, prefer create_note unless it asks to remind.",
    "- If transcript says something happened/done/given/eaten, use a diary entry, not a reminder.",
    "- If user says a medicine was given/taken, use create_medicine_entry with taken=true.",
    "- If user says feeding happened, use create_feeding_entry.",
    "- If user says weight was measured, use create_weight_entry.",
    "- If user says an amount of water was drunk or given, use create_water_entry. Do not use it for reminders or for symptoms such as refusing water.",
    "- If user says a vaccination, deworming, flea or tick treatment was completed, use create_vaccination_entry.",
    "- If user says vomiting/diarrhea/no appetite/lethargy/pain, use create_symptom_entry unless it is just a general note.",
    "- For diary entries without an explicit date or time in the transcript, leave localDate/localTime null; backend will use clientNow.",
    "- If reminder has no date, choose the nearest future time relative to clientNow in the provided timezone.",
    "- If reminder time is ambiguous, add warning or return unknown.",
    "- Preserve user-provided comments in note fields.",
    "- For unknown or unsafe medical advice requests, return intent unknown.",
    "Examples:",
    "напомни покормить в 5 => create_reminder, target reminder, type FEEDING",
    "напомни дать воды в 5 => create_reminder, target reminder, type WATER",
    "напомни сделать прививку завтра => create_reminder, target reminder, type VACCINATION",
    "покормил кота в пятнадцать минут первого => create_feeding_entry, target diary, localTime 12:15",
    "покормил кота без двадцати час => create_feeding_entry, target diary, localTime 12:40",
    "remind me to feed at 5 => create_reminder, target reminder, type FEEDING",
    "remind me to give water at 5 => create_reminder, target reminder, type WATER",
    "remind me about vaccination tomorrow => create_reminder, target reminder, type VACCINATION",
    "remind me to feed at quarter past one => create_reminder, target reminder, type FEEDING, localTime 01:15 or 13:15 by context",
    "fed the cat at twenty to one => create_feeding_entry, target diary, localTime 00:40 or 12:40 by context",
    "recuérdame darle medicina a las 5 => create_reminder, target reminder, type MEDICINE",
    "comió a la una y cuarto => create_feeding_entry, target diary, localTime 01:15 or 13:15 by context",
    "rappelle-moi de le nourrir à 17h => create_reminder, target reminder, type FEEDING",
    "a mangé à une heure moins vingt => create_feeding_entry, target diary, localTime 00:40 or 12:40 by context",
    "erinnere mich um 5 ans Füttern => create_reminder, target reminder, type FEEDING",
    "gefüttert um Viertel nach eins => create_feeding_entry, target diary, localTime 01:15 or 13:15 by context",
    "提醒我五点喂食 => create_reminder, target reminder, type FEEDING",
    "一点一刻喂了猫 => create_feeding_entry, target diary, localTime 01:15 or 13:15 by context",
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
    "кот выпил 200 мл воды => create_water_entry, target diary, amountMl 200",
    "the cat drank 200 ml of water => create_water_entry, target diary, amountMl 200",
    "el gato bebió 200 ml de agua => create_water_entry, target diary, amountMl 200",
    "le chat a bu 200 ml d'eau => create_water_entry, target diary, amountMl 200",
    "die Katze hat 200 ml Wasser getrunken => create_water_entry, target diary, amountMl 200",
    "猫喝了200毫升水 => create_water_entry, target diary, amountMl 200",
    "сделали прививку от бешенства => create_vaccination_entry, target diary, procedureType VACCINE",
    "completed deworming today => create_vaccination_entry, target diary, procedureType DEWORMING",
    "tratamiento contra pulgas realizado => create_vaccination_entry, target diary, procedureType FLEA_TICK",
    "vermifuge donné aujourd'hui => create_vaccination_entry, target diary, procedureType DEWORMING",
    "heute entwurmt => create_vaccination_entry, target diary, procedureType DEWORMING",
    "今天已驱虫 => create_vaccination_entry, target diary, procedureType DEWORMING",
    "запиши заметку плохо ел утром => create_note, target diary",
    "Return exactly this JSON shape with no Markdown:",
    "{\"intent\":\"create_reminder|create_feeding_entry|create_medicine_entry|create_symptom_entry|create_weight_entry|create_note|create_water_entry|create_vaccination_entry|unknown\",\"target\":\"reminder|diary|unknown\",\"confidence\":0.0,\"draft\":{\"localDate\":null,\"localTime\":null,\"hasExplicitDate\":false,\"hasExplicitTime\":false},\"warnings\":[]}"
  ].join("\n");
}

export async function parseVoiceCommandWithMinimax(input: {
  transcript: string;
  clientNow: string;
  timezone: string;
  locale?: string;
  debug?: {
    requestId?: string;
    userId?: string;
    logTranscript?: boolean;
  };
}) {
  const providers = voiceParserProviders();
  let lastError: unknown;

  for (const [attemptIndex, provider] of providers.entries()) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.FRONTEND_URL,
          "X-Title": "PetCare Diary"
        },
        body: JSON.stringify({
          model: provider.model,
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
          temperature: 0,
          response_format: provider.supportsStrictSchema
            ? { type: "json_schema", json_schema: voiceCommandJsonSchema }
            : { type: "json_object" },
          [provider.tokenLimitField]: 550
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
      logVoiceParserTemporalDebug({
        transcript: input.transcript,
        clientNow: input.clientNow,
        timezone: input.timezone,
        debug: input.debug,
        raw: json,
        normalized: normalizedJson
      });
      const parsedCommand = parsedCommandSchema.safeParse(normalizedJson);
      if (!parsedCommand.success) {
        throw new HttpError(422, "VOICE_PARSE_FAILED", "Voice command parser returned an invalid draft.");
      }

      return parsedCommand.data;
    } catch (error) {
      lastError = error;
      console.warn(JSON.stringify({
        event: "voice_parser_attempt_failed",
        model: provider.model,
        attempt: attemptIndex + 1,
        hasFallback: attemptIndex < providers.length - 1,
        reason: error instanceof HttpError ? error.code : error instanceof Error ? error.name : "unknown"
      }));
    }
  }

  throw lastError instanceof HttpError
    ? lastError
    : new HttpError(422, "VOICE_PARSE_FAILED", "Voice command parser failed.");
}
