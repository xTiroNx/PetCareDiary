process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.MINIMAX_API_KEY = "test_minimax_key";
process.env.MINIMAX_PARSER_MODEL = "MiniMax-M2.7";

const { parseVoiceCommandWithMinimax } = await import("../src/services/minimaxVoiceCommandParser.service.js");
const { HttpError } = await import("../src/utils/httpError.js");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function mockMiniMax(content: string) {
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content } }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function parse(
  transcript: string,
  locale: "ru" | "en" | "es" | "fr" | "de" | "zh" = "ru",
  overrides: { clientNow?: string; timezone?: string } = {}
) {
  return parseVoiceCommandWithMinimax({
    transcript,
    clientNow: overrides.clientNow ?? "2026-05-07T12:00:00.000Z",
    timezone: overrides.timezone ?? "Europe/Moscow",
    locale
  });
}

function localHourMinute(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(new Date(iso));
  return `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}`;
}

mockMiniMax(JSON.stringify({
  intent: "create_medicine_entry",
  confidence: 0.91,
  draft: {
    medicineName: "антепсин",
    dosage: "",
    taken: true,
    dateTime: "2026-05-07T12:00:00.000Z",
    note: null
  },
  warnings: ["dosage_not_provided"]
}));
const medicine = await parse("дал лекарство антепсин");
assert(medicine.intent === "create_medicine_entry", "Expected medicine intent.");
assert(medicine.target === "diary", "Expected diary target.");
assert(medicine.draft.medicineName === "антепсин", "Expected medicine name in draft.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.86,
  draft: {
    type: "FEEDING",
    title: "Покормить",
    time: "2026-05-07T14:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const reminder = await parse("напомни покормить в 5");
assert(reminder.intent === "create_reminder", "Expected reminder intent.");
assert(reminder.target === "reminder", "Expected reminder target.");
assert(reminder.draft.type === "FEEDING", "Expected feeding reminder type.");
assert(reminder.draft.time === "2026-05-07T14:00:00.000Z", `Expected ambiguous reminder at five to choose 17:00 Moscow, got ${reminder.draft.time}`);

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.86,
  draft: {
    type: "WATER",
    title: "Дать воды",
    time: "2026-05-07T14:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const waterReminder = await parse("напомни дать воды в 5");
assert(waterReminder.intent === "create_reminder", "Expected water reminder intent.");
assert(waterReminder.draft.type === "WATER", "Expected water reminder type.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.86,
  draft: {
    type: "VACCINATION",
    title: "Прививка",
    time: "2026-05-08T09:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const vaccinationReminder = await parse("напомни сделать прививку завтра");
assert(vaccinationReminder.intent === "create_reminder", "Expected vaccination reminder intent.");
assert(vaccinationReminder.draft.type === "VACCINATION", "Expected vaccination reminder type.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.9,
  draft: {
    type: "FEEDING",
    title: "Покормить",
    time: "2026-05-07T18:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const moscowReminder = await parse("напомни покормить в 18:00", "ru", {
  clientNow: "2026-05-07T14:36:00.000Z",
  timezone: "Europe/Moscow"
});
assert(moscowReminder.draft.time === "2026-05-07T15:00:00.000Z", `Expected Moscow 18:00 to be 15:00Z, got ${moscowReminder.draft.time}`);
assert(localHourMinute(moscowReminder.draft.time, "Europe/Moscow") === "18:00", "Expected Moscow reminder to display 18:00 local.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.9,
  draft: {
    type: "FEEDING",
    title: "Feed",
    time: "2026-05-07T18:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const parisReminder = await parse("remind me to feed at 18:00", "en", {
  clientNow: "2026-05-07T15:36:00.000Z",
  timezone: "Europe/Paris"
});
assert(parisReminder.draft.time === "2026-05-07T16:00:00.000Z", `Expected Paris 18:00 DST to be 16:00Z, got ${parisReminder.draft.time}`);
assert(localHourMinute(parisReminder.draft.time, "Europe/Paris") === "18:00", "Expected Paris reminder to display 18:00 local.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.9,
  draft: {
    type: "FEEDING",
    title: "喂食",
    time: "2026-05-07T18:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const shanghaiReminder = await parse("提醒我18点喂食", "zh", {
  clientNow: "2026-05-07T09:36:00.000Z",
  timezone: "Asia/Shanghai"
});
assert(shanghaiReminder.draft.time === "2026-05-07T10:00:00.000Z", `Expected Shanghai 18:00 to be 10:00Z, got ${shanghaiReminder.draft.time}`);
assert(localHourMinute(shanghaiReminder.draft.time, "Asia/Shanghai") === "18:00", "Expected Shanghai reminder to display 18:00 local.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.9,
  draft: {
    type: "FEEDING",
    title: "Comida",
    time: "2026-05-07T18:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const madridReminder = await parse("recuérdame comida a las 18:00", "es", {
  clientNow: "2026-05-07T15:36:00.000Z",
  timezone: "Europe/Madrid"
});
assert(madridReminder.draft.time === "2026-05-07T16:00:00.000Z", `Expected Madrid 18:00 DST to be 16:00Z, got ${madridReminder.draft.time}`);
assert(localHourMinute(madridReminder.draft.time, "Europe/Madrid") === "18:00", "Expected Madrid reminder to display 18:00 local.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.9,
  draft: {
    type: "FEEDING",
    title: "Покормить",
    time: "2026-05-07T18:00:00.000Z",
    repeatRule: null
  },
  warnings: []
}));
const tomorrowReminder = await parse("напомни покормить в 18:00", "ru", {
  clientNow: "2026-05-07T16:30:00.000Z",
  timezone: "Europe/Moscow"
});
assert(tomorrowReminder.draft.time === "2026-05-08T15:00:00.000Z", `Expected passed Moscow 18:00 to move tomorrow, got ${tomorrowReminder.draft.time}`);

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.9,
  draft: {
    dateTime: "2026-05-07T18:00:00.000Z",
    foodType: "WET",
    amount: "1 порция",
    note: null
  },
  warnings: []
}));
const feedingAtLocalTime = await parse("покормил влажным кормом в 18:00", "ru", {
  clientNow: "2026-05-07T14:36:00.000Z",
  timezone: "Europe/Moscow"
});
assert(feedingAtLocalTime.draft.dateTime === "2026-05-07T15:00:00.000Z", `Expected feeding 18:00 Moscow to be 15:00Z, got ${feedingAtLocalTime.draft.dateTime}`);

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.95,
  draft: {
    foodType: "OTHER",
    amount: "не указано",
    note: null
  },
  warnings: []
}));
const feedingAtTwelve = await parse("I fed a cat at twelve.", "en", {
  clientNow: "2026-05-11T10:43:00.000Z",
  timezone: "Europe/Moscow"
});
assert(feedingAtTwelve.draft.dateTime === "2026-05-11T09:00:00.000Z", `Expected feeding at twelve Moscow to be 09:00Z, got ${feedingAtTwelve.draft.dateTime}`);
assert(localHourMinute(feedingAtTwelve.draft.dateTime, "Europe/Moscow") === "12:00", "Expected feeding at twelve to display 12:00 local.");

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.96,
  draft: {
    foodType: "WET",
    amount: "1 пакетик",
    note: null
  },
  warnings: []
}));
const feedingAtOne = await parse("Покормил кота в час влажный пакетик.", "ru", {
  clientNow: "2026-05-11T11:31:00.000Z",
  timezone: "Europe/Moscow"
});
assert(feedingAtOne.draft.dateTime === "2026-05-11T10:00:00.000Z", `Expected feeding at one Moscow to be 10:00Z, got ${feedingAtOne.draft.dateTime}`);
assert(localHourMinute(feedingAtOne.draft.dateTime, "Europe/Moscow") === "13:00", "Expected feeding at one to display 13:00 local when current local time is 14:31.");

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 1,
  draft: {
    dateTime: "2026-05-11T13:00:00.000Z",
    foodType: "OTHER",
    amount: "",
    note: null
  },
  warnings: []
}));
const feedingAtOneAfternoon = await parse("Покормил кота в час дня.", "ru", {
  clientNow: "2026-05-11T11:49:00.000Z",
  timezone: "Europe/Moscow"
});
assert(feedingAtOneAfternoon.draft.dateTime === "2026-05-11T10:00:00.000Z", `Expected feeding at one day Moscow to be 10:00Z, got ${feedingAtOneAfternoon.draft.dateTime}`);
assert(localHourMinute(feedingAtOneAfternoon.draft.dateTime, "Europe/Moscow") === "13:00", "Expected feeding at one day to display 13:00 local.");

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 1,
  draft: {
    dateTime: "2026-05-11T10:00:00.000Z",
    foodType: "OTHER",
    amount: "",
    note: null
  },
  warnings: []
}));
const feedingAtOneAfternoonAlreadyUtc = await parse("Покормил кота в час дня.", "ru", {
  clientNow: "2026-05-11T11:49:00.000Z",
  timezone: "Europe/Moscow"
});
assert(feedingAtOneAfternoonAlreadyUtc.draft.dateTime === "2026-05-11T10:00:00.000Z", `Expected feeding at one day to ignore raw 10:00Z and stay 10:00Z, got ${feedingAtOneAfternoonAlreadyUtc.draft.dateTime}`);
assert(localHourMinute(feedingAtOneAfternoonAlreadyUtc.draft.dateTime, "Europe/Moscow") === "13:00", "Expected feeding at one day raw UTC variant to display 13:00 local.");

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.96,
  draft: {
    localDate: null,
    localTime: "12:15",
    hasExplicitDate: false,
    hasExplicitTime: true,
    foodType: "OTHER",
    amount: "не указано",
    note: null
  },
  warnings: []
}));
const russianQuarterAfterNoon = await parse("Покормил кота в пятнадцать минут первого.", "ru", {
  clientNow: "2026-05-11T11:49:00.000Z",
  timezone: "Europe/Moscow"
});
assert(russianQuarterAfterNoon.draft.dateTime === "2026-05-11T09:15:00.000Z", `Expected fifteen minutes of first to be 09:15Z, got ${russianQuarterAfterNoon.draft.dateTime}`);
assert(localHourMinute(russianQuarterAfterNoon.draft.dateTime, "Europe/Moscow") === "12:15", "Expected fifteen minutes of first to display 12:15 local.");

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.96,
  draft: {
    localDate: null,
    localTime: "12:40",
    hasExplicitDate: false,
    hasExplicitTime: true,
    foodType: "OTHER",
    amount: "не указано",
    note: null
  },
  warnings: []
}));
const russianTwentyToOne = await parse("Покормил кота без двадцати час.", "ru", {
  clientNow: "2026-05-11T11:49:00.000Z",
  timezone: "Europe/Moscow"
});
assert(russianTwentyToOne.draft.dateTime === "2026-05-11T09:40:00.000Z", `Expected twenty to one to be 09:40Z, got ${russianTwentyToOne.draft.dateTime}`);
assert(localHourMinute(russianTwentyToOne.draft.dateTime, "Europe/Moscow") === "12:40", "Expected twenty to one to display 12:40 local.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.92,
  draft: {
    type: "FEEDING",
    title: "Feed",
    localDate: null,
    localTime: "01:15",
    hasExplicitDate: false,
    hasExplicitTime: true,
    repeatRule: null
  },
  warnings: []
}));
const englishQuarterPastOneReminder = await parse("remind me to feed at quarter past one", "en", {
  clientNow: "2026-05-11T09:00:00.000Z",
  timezone: "Europe/Moscow"
});
assert(englishQuarterPastOneReminder.draft.time === "2026-05-11T10:15:00.000Z", `Expected quarter past one reminder to choose 13:15 Moscow, got ${englishQuarterPastOneReminder.draft.time}`);
assert(localHourMinute(englishQuarterPastOneReminder.draft.time, "Europe/Moscow") === "13:15", "Expected quarter past one reminder to display nearest future 13:15 local.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.92,
  draft: {
    type: "FEEDING",
    title: "Feed",
    localDate: null,
    localTime: "12:40",
    hasExplicitDate: false,
    hasExplicitTime: true,
    repeatRule: null
  },
  warnings: []
}));
const englishTwentyToOneReminder = await parse("remind me to feed at twenty to one", "en", {
  clientNow: "2026-05-11T09:00:00.000Z",
  timezone: "Europe/Moscow"
});
assert(englishTwentyToOneReminder.draft.time === "2026-05-11T09:40:00.000Z", `Expected twenty to one reminder to choose 12:40 Moscow, got ${englishTwentyToOneReminder.draft.time}`);
assert(localHourMinute(englishTwentyToOneReminder.draft.time, "Europe/Moscow") === "12:40", "Expected twenty to one reminder to display nearest future 12:40 local.");

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.92,
  draft: {
    localDate: null,
    localTime: "01:15",
    hasExplicitDate: false,
    hasExplicitTime: true,
    foodType: "OTHER",
    amount: "no especificado",
    note: null
  },
  warnings: []
}));
const spanishQuarterPastOne = await parse("comió a la una y cuarto", "es", {
  clientNow: "2026-05-11T11:49:00.000Z",
  timezone: "Europe/Moscow"
});
assert(spanishQuarterPastOne.draft.dateTime === "2026-05-11T10:15:00.000Z", `Expected Spanish una y cuarto to choose 13:15 Moscow, got ${spanishQuarterPastOne.draft.dateTime}`);

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.92,
  draft: {
    localDate: null,
    localTime: "12:40",
    hasExplicitDate: false,
    hasExplicitTime: true,
    foodType: "OTHER",
    amount: "non spécifié",
    note: null
  },
  warnings: []
}));
const frenchTwentyToOne = await parse("a mangé à une heure moins vingt", "fr", {
  clientNow: "2026-05-11T11:49:00.000Z",
  timezone: "Europe/Moscow"
});
assert(frenchTwentyToOne.draft.dateTime === "2026-05-11T09:40:00.000Z", `Expected French moins vingt to be 12:40 Moscow, got ${frenchTwentyToOne.draft.dateTime}`);

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.92,
  draft: {
    localDate: null,
    localTime: "01:15",
    hasExplicitDate: false,
    hasExplicitTime: true,
    foodType: "OTHER",
    amount: "nicht angegeben",
    note: null
  },
  warnings: []
}));
const germanQuarterPastOne = await parse("gefüttert um Viertel nach eins", "de", {
  clientNow: "2026-05-11T11:49:00.000Z",
  timezone: "Europe/Moscow"
});
assert(germanQuarterPastOne.draft.dateTime === "2026-05-11T10:15:00.000Z", `Expected German Viertel nach eins to choose 13:15 Moscow, got ${germanQuarterPastOne.draft.dateTime}`);

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.96,
  draft: {
    foodType: "WET",
    amount: "1 пакетик",
    note: null
  },
  warnings: []
}));
const feedingAtOneNight = await parse("Покормил кота в час ночи.", "ru", {
  clientNow: "2026-05-11T11:31:00.000Z",
  timezone: "Europe/Moscow"
});
assert(feedingAtOneNight.draft.dateTime === "2026-05-10T22:00:00.000Z", `Expected feeding at one night Moscow to be 22:00Z previous UTC day, got ${feedingAtOneNight.draft.dateTime}`);
assert(localHourMinute(feedingAtOneNight.draft.dateTime, "Europe/Moscow") === "01:00", "Expected feeding at one night to display 01:00 local.");

mockMiniMax(JSON.stringify({
  intent: "create_reminder",
  confidence: 0.95,
  draft: {
    type: "FEEDING",
    title: "Покормить",
    repeatRule: null
  },
  warnings: []
}));
const reminderAtSixEvening = await parse("напомни покормить в шесть вечера", "ru", {
  clientNow: "2026-05-11T10:43:00.000Z",
  timezone: "Europe/Moscow"
});
assert(reminderAtSixEvening.draft.time === "2026-05-11T15:00:00.000Z", `Expected six evening Moscow to be 15:00Z, got ${reminderAtSixEvening.draft.time}`);

mockMiniMax(JSON.stringify({
  intent: "create_medicine_entry",
  confidence: 0.9,
  draft: {
    medicineName: "антепсин",
    dosage: "",
    taken: true,
    note: null
  },
  warnings: []
}));
const medicineWithoutTime = await parse("дал лекарство антепсин", "ru", {
  clientNow: "2026-05-07T14:36:00.000Z",
  timezone: "Europe/Moscow"
});
assert(medicineWithoutTime.draft.dateTime === "2026-05-07T14:36:00.000Z", "Expected medicine without time to use clientNow.");

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.9,
  draft: {
    dateTime: "2026-05-08T17:28:00.000Z",
    foodType: "OTHER",
    amount: "не указано",
    note: null
  },
  warnings: []
}));
const feedingWithoutTimeCopiedClientNow = await parse("покормил кота", "ru", {
  clientNow: "2026-05-08T17:28:00.000Z",
  timezone: "Europe/Moscow"
});
assert(
  feedingWithoutTimeCopiedClientNow.draft.dateTime === "2026-05-08T17:28:00.000Z",
  `Expected feeding without time to preserve clientNow instant, got ${feedingWithoutTimeCopiedClientNow.draft.dateTime}`
);
assert(
  localHourMinute(feedingWithoutTimeCopiedClientNow.draft.dateTime, "Europe/Moscow") === "20:28",
  "Expected feeding without time to display current Moscow local time."
);

mockMiniMax(JSON.stringify({
  intent: "create_feeding_entry",
  confidence: 0.9,
  draft: {
    dateTime: "2026-05-08T12:28:00.000Z",
    foodType: "OTHER",
    amount: "not specified",
    note: null
  },
  warnings: []
}));
const parisFeedingWithoutTime = await parse("fed the cat", "en", {
  clientNow: "2026-05-08T12:28:00.000Z",
  timezone: "Europe/Paris"
});
assert(parisFeedingWithoutTime.draft.dateTime === "2026-05-08T12:28:00.000Z", "Expected Paris feeding without time to preserve clientNow.");
assert(localHourMinute(parisFeedingWithoutTime.draft.dateTime, "Europe/Paris") === "14:28", "Expected Paris feeding without time to display client local time.");

mockMiniMax(JSON.stringify({
  intent: "create_symptom_entry",
  confidence: 0.9,
  draft: {
    dateTime: "2026-05-07T18:00:00.000Z",
    symptomType: "VOMITING",
    severity: 2,
    note: "рвота"
  },
  warnings: []
}));
const symptomAtLocalTime = await parse("рвота в 18:00", "ru", {
  clientNow: "2026-05-07T14:36:00.000Z",
  timezone: "Europe/Moscow"
});
assert(symptomAtLocalTime.draft.dateTime === "2026-05-07T15:00:00.000Z", `Expected symptom 18:00 Moscow to be 15:00Z, got ${symptomAtLocalTime.draft.dateTime}`);

mockMiniMax(JSON.stringify({
  intent: "create_note",
  confidence: 0.9,
  draft: {
    dateTime: "2026-05-07T18:00:00.000Z",
    note: "заметка"
  },
  warnings: []
}));
const noteAtLocalTime = await parse("запиши заметку в 18:00", "ru", {
  clientNow: "2026-05-07T14:36:00.000Z",
  timezone: "Europe/Moscow"
});
assert(noteAtLocalTime.draft.dateTime === "2026-05-07T15:00:00.000Z", `Expected note 18:00 Moscow to be 15:00Z, got ${noteAtLocalTime.draft.dateTime}`);

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: {
    dateTime: "2026-05-07T12:00:00.000Z",
    note: "покормил влажным кормом утром"
  },
  warnings: []
}));
const feeding = await parse("покормил влажным кормом утром");
assert(feeding.intent === "create_feeding_entry", "Expected rule-corrected feeding intent.");
assert(feeding.target === "diary", "Expected feeding diary target.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: {
    dateTime: "2026-05-07T12:00:00.000Z",
    note: "рвота утром два раза"
  },
  warnings: []
}));
const symptom = await parse("рвота утром два раза");
assert(symptom.intent === "create_symptom_entry", "Expected rule-corrected symptom intent.");

mockMiniMax(JSON.stringify({
  intent: "unknown",
  target: "unknown",
  confidence: 0.3,
  draft: {},
  warnings: []
}));
const englishReminder = await parse("remind me to feed at 5", "en");
assert(englishReminder.intent === "create_reminder", "Expected English reminder intent.");
assert(englishReminder.target === "reminder", "Expected English reminder target.");
assert(englishReminder.draft.type === "FEEDING", "Expected English feeding reminder type.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: { dateTime: "2026-05-07T12:00:00.000Z", note: "comió comida húmeda por la mañana" },
  warnings: []
}));
const spanishFeeding = await parse("comió comida húmeda por la mañana", "es");
assert(spanishFeeding.intent === "create_feeding_entry", "Expected Spanish feeding intent.");
assert(spanishFeeding.draft.foodType === "WET", "Expected Spanish wet food inference.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: { dateTime: "2026-05-07T12:00:00.000Z", note: "vomissements deux fois ce matin" },
  warnings: []
}));
const frenchSymptom = await parse("vomissements deux fois ce matin", "fr");
assert(frenchSymptom.intent === "create_symptom_entry", "Expected French symptom intent.");
assert(frenchSymptom.draft.symptomType === "VOMITING", "Expected French vomiting inference.");

mockMiniMax(JSON.stringify({
  intent: "create_note",
  target: "diary",
  confidence: 0.7,
  draft: { dateTime: "2026-05-07T12:00:00.000Z", note: "Gewicht 4,2 kg" },
  warnings: []
}));
const germanWeight = await parse("Gewicht 4,2 kg", "de");
assert(germanWeight.intent === "create_weight_entry", "Expected German weight intent.");
assert(germanWeight.draft.weightKg.toString() === "4.2", "Expected German weight value inference.");

mockMiniMax(JSON.stringify({
  intent: "unknown",
  target: "unknown",
  confidence: 0.3,
  draft: {},
  warnings: []
}));
const chineseNote = await parse("记录备注 早上没胃口", "zh");
assert(chineseNote.intent === "create_note", "Expected Chinese explicit note to stay note.");
assert(chineseNote.draft.note === "记录备注 早上没胃口", "Expected Chinese note fallback from transcript.");

mockMiniMax(JSON.stringify({
  intent: "unknown",
  target: "unknown",
  confidence: 0.2,
  draft: {},
  warnings: ["ambiguous_command"]
}));
const unknown = await parse("что-то странное");
assert(unknown.intent === "unknown", "Expected unknown intent.");

mockMiniMax(JSON.stringify({
  intent: "create_medicine_entry",
  confidence: "91%",
  draft: {
    name: "антепсин",
    taken: true
  },
  warnings: []
}));
const normalizedMedicine = await parse("дал лекарство антепсин");
assert(normalizedMedicine.intent === "create_medicine_entry", "Expected normalized medicine intent.");
assert(normalizedMedicine.draft.medicineName === "антепсин", "Expected normalized medicine name.");
assert(normalizedMedicine.draft.dosage === "", "Expected missing dosage to stay empty.");

mockMiniMax("not json");
try {
  await parse("сломай json");
  throw new Error("Expected invalid JSON to fail.");
} catch (error) {
  assert(error instanceof HttpError && error.code === "VOICE_PARSE_FAILED", "Expected VOICE_PARSE_FAILED.");
}

console.log("Voice parser smoke checks passed.");
