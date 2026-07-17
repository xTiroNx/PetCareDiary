process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.MINIMAX_API_KEY = "test_minimax_key";
process.env.MINIMAX_PARSER_MODEL = "MiniMax-M2.7";

const { parseVoiceCommandWithMinimax } = await import("../src/services/minimaxVoiceCommandParser.service.js");

type Locale = "ru" | "en" | "es" | "fr" | "de" | "zh";
type Expected = {
  intent: string;
  target: string;
  draft?: Record<string, unknown>;
};
type Case = {
  phrase: string;
  locale: Locale;
  expected: Expected;
};

const clientNow = "2026-05-07T12:00:00.000Z";

const cases: Case[] = [
  { phrase: "напомни дать антепсин в 17", locale: "ru", expected: { intent: "create_reminder", target: "reminder", draft: { type: "MEDICINE" } } },
  { phrase: "напомни покормить в 5", locale: "ru", expected: { intent: "create_reminder", target: "reminder", draft: { type: "FEEDING" } } },
  { phrase: "покормил кота в пятнадцать минут первого", locale: "ru", expected: { intent: "create_feeding_entry", target: "diary" } },
  { phrase: "покормил кота без двадцати час", locale: "ru", expected: { intent: "create_feeding_entry", target: "diary" } },
  { phrase: "дала антепсин", locale: "ru", expected: { intent: "create_medicine_entry", target: "diary", draft: { medicineName: "антепсин" } } },
  { phrase: "покормила влажным кормом", locale: "ru", expected: { intent: "create_feeding_entry", target: "diary", draft: { foodType: "WET" } } },
  { phrase: "сегодня плохо ел", locale: "ru", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "NO_APPETITE" } } },
  { phrase: "рвота утром", locale: "ru", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "VOMITING" } } },
  { phrase: "вес 4 и 2", locale: "ru", expected: { intent: "create_weight_entry", target: "diary", draft: { weightKg: 4.2 } } },
  { phrase: "запиши заметку плохо ел утром", locale: "ru", expected: { intent: "create_note", target: "diary" } },
  { phrase: "кот выпил 200 мл воды", locale: "ru", expected: { intent: "create_water_entry", target: "diary", draft: { amountMl: 200 } } },
  { phrase: "сегодня сделали прививку от бешенства", locale: "ru", expected: { intent: "create_vaccination_entry", target: "diary", draft: { procedureType: "VACCINE" } } },
  { phrase: "запиши питьё для Барсика сегодня в 10 утра выпил 200 мл воды", locale: "ru", expected: { intent: "create_water_entry", target: "diary", draft: { amountMl: 200 } } },
  { phrase: "запиши вакцинацию для Барсика сегодня сделали прививку от бешенства", locale: "ru", expected: { intent: "create_vaccination_entry", target: "diary", draft: { procedureType: "VACCINE" } } },

  { phrase: "remind me to give antepsin at 5", locale: "en", expected: { intent: "create_reminder", target: "reminder", draft: { type: "MEDICINE" } } },
  { phrase: "remind me to feed at 5", locale: "en", expected: { intent: "create_reminder", target: "reminder", draft: { type: "FEEDING" } } },
  { phrase: "remind me to feed at quarter past one", locale: "en", expected: { intent: "create_reminder", target: "reminder", draft: { type: "FEEDING" } } },
  { phrase: "remind me to feed at twenty to one", locale: "en", expected: { intent: "create_reminder", target: "reminder", draft: { type: "FEEDING" } } },
  { phrase: "gave antepsin", locale: "en", expected: { intent: "create_medicine_entry", target: "diary", draft: { medicineName: "antepsin" } } },
  { phrase: "fed wet food this morning", locale: "en", expected: { intent: "create_feeding_entry", target: "diary", draft: { foodType: "WET" } } },
  { phrase: "no appetite today", locale: "en", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "NO_APPETITE" } } },
  { phrase: "vomited this morning", locale: "en", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "VOMITING" } } },
  { phrase: "weight four point two", locale: "en", expected: { intent: "create_weight_entry", target: "diary", draft: { weightKg: 4.2 } } },
  { phrase: "write note no appetite in the morning", locale: "en", expected: { intent: "create_note", target: "diary" } },
  { phrase: "the cat drank 200 ml of water", locale: "en", expected: { intent: "create_water_entry", target: "diary", draft: { amountMl: 200 } } },
  { phrase: "completed deworming today", locale: "en", expected: { intent: "create_vaccination_entry", target: "diary", draft: { procedureType: "DEWORMING" } } },

  { phrase: "recuérdame darle medicina a las 17", locale: "es", expected: { intent: "create_reminder", target: "reminder", draft: { type: "MEDICINE" } } },
  { phrase: "comió a la una y cuarto", locale: "es", expected: { intent: "create_feeding_entry", target: "diary" } },
  { phrase: "di antepsin", locale: "es", expected: { intent: "create_medicine_entry", target: "diary", draft: { medicineName: "antepsin" } } },
  { phrase: "comió comida húmeda por la mañana", locale: "es", expected: { intent: "create_feeding_entry", target: "diary", draft: { foodType: "WET" } } },
  { phrase: "sin apetito hoy", locale: "es", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "NO_APPETITE" } } },
  { phrase: "vómito por la mañana", locale: "es", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "VOMITING" } } },
  { phrase: "peso 4,2 kg", locale: "es", expected: { intent: "create_weight_entry", target: "diary", draft: { weightKg: 4.2 } } },
  { phrase: "nota sin apetito por la mañana", locale: "es", expected: { intent: "create_note", target: "diary" } },
  { phrase: "el gato bebió 200 ml de agua", locale: "es", expected: { intent: "create_water_entry", target: "diary", draft: { amountMl: 200 } } },
  { phrase: "vacuna contra la rabia puesta hoy", locale: "es", expected: { intent: "create_vaccination_entry", target: "diary", draft: { procedureType: "VACCINE" } } },

  { phrase: "rappelle-moi de donner le médicament à 17h", locale: "fr", expected: { intent: "create_reminder", target: "reminder", draft: { type: "MEDICINE" } } },
  { phrase: "a mangé à une heure moins vingt", locale: "fr", expected: { intent: "create_feeding_entry", target: "diary" } },
  { phrase: "médicament donné antepsin", locale: "fr", expected: { intent: "create_medicine_entry", target: "diary", draft: { medicineName: "antepsin" } } },
  { phrase: "a mangé de la pâtée ce matin", locale: "fr", expected: { intent: "create_feeding_entry", target: "diary", draft: { foodType: "WET" } } },
  { phrase: "pas d'appétit aujourd'hui", locale: "fr", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "NO_APPETITE" } } },
  { phrase: "vomi ce matin", locale: "fr", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "VOMITING" } } },
  { phrase: "poids quatre virgule deux", locale: "fr", expected: { intent: "create_weight_entry", target: "diary", draft: { weightKg: 4.2 } } },
  { phrase: "note pas d'appétit ce matin", locale: "fr", expected: { intent: "create_note", target: "diary" } },
  { phrase: "le chat a bu 200 ml d'eau", locale: "fr", expected: { intent: "create_water_entry", target: "diary", draft: { amountMl: 200 } } },
  { phrase: "vermifuge donné aujourd'hui", locale: "fr", expected: { intent: "create_vaccination_entry", target: "diary", draft: { procedureType: "DEWORMING" } } },

  { phrase: "erinnere mich um 17 Uhr an Medikament", locale: "de", expected: { intent: "create_reminder", target: "reminder", draft: { type: "MEDICINE" } } },
  { phrase: "gefüttert um Viertel nach eins", locale: "de", expected: { intent: "create_feeding_entry", target: "diary" } },
  { phrase: "Antepsin gegeben", locale: "de", expected: { intent: "create_medicine_entry", target: "diary", draft: { medicineName: "antepsin" } } },
  { phrase: "heute Morgen Nassfutter gefressen", locale: "de", expected: { intent: "create_feeding_entry", target: "diary", draft: { foodType: "WET" } } },
  { phrase: "kein Appetit heute", locale: "de", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "NO_APPETITE" } } },
  { phrase: "heute Morgen erbrochen", locale: "de", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "VOMITING" } } },
  { phrase: "Gewicht vier komma zwei", locale: "de", expected: { intent: "create_weight_entry", target: "diary", draft: { weightKg: 4.2 } } },
  { phrase: "Notiz kein Appetit am Morgen", locale: "de", expected: { intent: "create_note", target: "diary" } },
  { phrase: "die Katze hat 200 ml Wasser getrunken", locale: "de", expected: { intent: "create_water_entry", target: "diary", draft: { amountMl: 200 } } },
  { phrase: "heute gegen Tollwut geimpft", locale: "de", expected: { intent: "create_vaccination_entry", target: "diary", draft: { procedureType: "VACCINE" } } },

  { phrase: "提醒我五点喂药", locale: "zh", expected: { intent: "create_reminder", target: "reminder", draft: { type: "MEDICINE" } } },
  { phrase: "给了药 antepsin", locale: "zh", expected: { intent: "create_medicine_entry", target: "diary", draft: { medicineName: "antepsin" } } },
  { phrase: "早上吃了湿粮", locale: "zh", expected: { intent: "create_feeding_entry", target: "diary", draft: { foodType: "WET" } } },
  { phrase: "今天没胃口", locale: "zh", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "NO_APPETITE" } } },
  { phrase: "早上吐了两次", locale: "zh", expected: { intent: "create_symptom_entry", target: "diary", draft: { symptomType: "VOMITING" } } },
  { phrase: "体重4.2公斤", locale: "zh", expected: { intent: "create_weight_entry", target: "diary", draft: { weightKg: 4.2 } } },
  { phrase: "记录备注 早上没胃口", locale: "zh", expected: { intent: "create_note", target: "diary" } },
  { phrase: "猫喝了200毫升水", locale: "zh", expected: { intent: "create_water_entry", target: "diary", draft: { amountMl: 200 } } },
  { phrase: "今天接种了狂犬病疫苗", locale: "zh", expected: { intent: "create_vaccination_entry", target: "diary", draft: { procedureType: "VACCINE" } } }
];

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function mockWeakMiniMax() {
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          intent: "unknown",
          target: "unknown",
          confidence: 0.25,
          draft: {},
          warnings: ["golden_weak_parser_mock"]
        })
      }
    }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function draftValue(value: unknown) {
  return typeof value === "number" ? Number(value.toFixed(3)) : value;
}

mockWeakMiniMax();

for (const item of cases) {
  const parsed = await parseVoiceCommandWithMinimax({
    transcript: item.phrase,
    clientNow,
    timezone: "Europe/Moscow",
    locale: item.locale
  });

  assert(parsed.intent === item.expected.intent, `[${item.locale}] ${item.phrase}: expected intent ${item.expected.intent}, got ${parsed.intent}`);
  assert(parsed.target === item.expected.target, `[${item.locale}] ${item.phrase}: expected target ${item.expected.target}, got ${parsed.target}`);

  for (const [key, expectedValue] of Object.entries(item.expected.draft ?? {})) {
    const actual = (parsed.draft as Record<string, unknown>)[key];
    assert(
      draftValue(actual) === draftValue(expectedValue),
      `[${item.locale}] ${item.phrase}: expected draft.${key} ${String(expectedValue)}, got ${String(actual)}`
    );
  }
}

console.log(`Voice parser golden smoke checks passed (${cases.length} cases).`);
