import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import { prisma } from "../prisma/client.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";
import { serialize } from "../utils/serialize.js";
import { HttpError } from "../utils/httpError.js";

const router = Router();
const dailyExportLimit = 3;

type ReportLanguage = "ru" | "en";

const reportText = {
  ru: {
    title: "Отчет PetCare Diary",
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
    title: "PetCare Diary Report",
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

const reportQuerySchema = z.object({
  petId: z.string().min(1).max(128),
  period: z.preprocess(
    (value) => value === "all" ? "all" : Number(value),
    z.union([z.literal("all"), z.number().int().refine((value) => [7, 14, 30].includes(value))])
  )
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

function pdfFont(doc: PDFKit.PDFDocument) {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf"
  ];
  const fontPath = candidates.find((candidate) => existsSync(candidate));
  if (!fontPath) return "Helvetica";
  doc.registerFont("PetCareFont", fontPath);
  return "PetCareFont";
}

function reportLanguage(languageCode?: string | null): ReportLanguage {
  if (languageCode?.toLowerCase().startsWith("en")) return "en";
  return "ru";
}

function renderReportPdf(report: Awaited<ReturnType<typeof buildReport>>, languageCode?: string | null) {
  return new Promise<Buffer>((resolve, reject) => {
    const language = reportLanguage(languageCode);
    const text = reportText[language];
    const locale = language === "en" ? "en-US" : "ru-RU";
    const doc = new PDFDocument({
      size: "A4",
      margin: 44,
      info: {
        Title: text.title,
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

    doc.font(font).fontSize(22).fillColor("#17202a").text(text.title, { align: "left" });
    doc.moveDown(0.4);
    value(text.pet, report.petName);
    value(text.petType, report.pet ? text.petTypes[report.pet.type] ?? report.pet.type : null);
    value(text.age, report.pet?.ageYears ? `${report.pet.ageYears.toString()} ${text.years}` : null);
    value(text.currentWeight, report.pet?.weightKg ? `${report.pet.weightKg.toString()} ${text.kg}` : null);
    value(text.healthNotes, report.pet?.healthNotes);
    value(text.period, periodLabel);
    value(text.generated, new Date().toLocaleString(locale));
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
      doc.font(font).fontSize(10).fillColor("#5f6673").text(new Date(date).toLocaleString(locale));
      details.forEach(([label, content]) => {
        if (!content) return;
        doc.font(font).fontSize(10).fillColor("#17202a").text(`${label}: ${content}`, { width: pageWidth });
      });
      doc.moveDown(0.4);
    };

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
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const report = await buildReport(prisma, req.user!.id, query.petId, query.period);
    res.json(serialize({
      period: report.period,
      from: report.from,
      petName: report.petName,
      counts: report.counts,
      entries: report.entries,
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

    const body = await renderReportPdf(report, req.user!.languageCode);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="petcare-report-${query.period === "all" ? "all" : `${query.period}d`}.pdf"`);
    res.send(body);
  } catch (error) {
    next(error);
  }
});

export default router;
