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
const foodLabels: Record<string, string> = {
  DRY: "Dry food",
  WET: "Wet food",
  NATURAL: "Natural food",
  TREAT: "Treat",
  OTHER: "Other"
};
const symptomLabels: Record<string, string> = {
  VOMITING: "Vomiting",
  YELLOW_VOMIT: "Yellow vomit",
  NO_APPETITE: "No appetite",
  DIARRHEA: "Diarrhea",
  CONSTIPATION: "Constipation",
  LETHARGY: "Lethargy",
  PAIN: "Pain",
  OTHER: "Other"
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
  const pet = await db.pet.findFirst({ where: { id: petId, userId } });
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
      orderBy: { dateTime: "desc" },
      take: 50
    }),
    db.symptomEntry.findMany({
      where: { userId, petId, dateTime: dateFilter },
      select: { id: true, dateTime: true, symptomType: true, severity: true, note: true },
      orderBy: { dateTime: "desc" },
      take: 50
    }),
    db.medicineEntry.findMany({
      where: { userId, petId, dateTime: dateFilter },
      select: { id: true, dateTime: true, medicineName: true, dosage: true, taken: true, note: true },
      orderBy: { dateTime: "desc" },
      take: 50
    }),
    db.weightEntry.findMany({
      where: { userId, petId, date: dateFilter },
      select: { id: true, date: true, weightKg: true },
      orderBy: { date: "desc" },
      take: 50
    }),
    db.noteEntry.findMany({
      where: { userId, petId, dateTime: dateFilter },
      select: { id: true, note: true, dateTime: true },
      orderBy: { dateTime: "desc" },
      take: 50
    })
  ]);

  const counts = { feeding, symptoms, medicines, medicinesTaken, weights, notes };
  const entries = { feeding: feedingEntries, symptoms: symptomEntries, medicines: medicineEntries, weights: weightEntries, notes: noteEntries };
  return { period, from, petName: pet?.name ?? "Pet", counts, entries };
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

function renderReportPdf(report: Awaited<ReturnType<typeof buildReport>>) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 44,
      info: {
        Title: "PetCare Diary Report",
        Author: "PetCare Diary"
      }
    });
    const chunks: Buffer[] = [];
    const font = pdfFont(doc);

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const periodLabel = report.period === "all" ? "all time" : `last ${report.period} days`;

    doc.font(font).fontSize(22).text("PetCare Diary Report", { align: "left" });
    doc.moveDown(0.4);
    doc.font(font).fontSize(11).fillColor("#5f6673").text(`Pet: ${report.petName}`);
    doc.text(`Period: ${periodLabel}`);
    doc.text(`Generated: ${new Date().toLocaleString("ru-RU")}`);
    doc.moveDown(1);

    doc.fillColor("#17202a").fontSize(15).text("Summary");
    doc.moveDown(0.5);
    const rows = [
      ["Feedings", report.counts.feeding],
      ["Symptoms", report.counts.symptoms],
      ["Medicines", report.counts.medicines],
      ["Medicines taken", report.counts.medicinesTaken],
      ["Weight records", report.counts.weights],
      ["Other notes", report.counts.notes]
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
    const empty = () => doc.font(font).fontSize(10).fillColor("#8a91a0").text("No records for this period.");
    const line = (date: Date, title: string, note?: string | null) => {
      ensureSpace();
      doc.font(font).fontSize(10).fillColor("#5f6673").text(new Date(date).toLocaleString("ru-RU"));
      doc.font(font).fontSize(11).fillColor("#17202a").text(title.slice(0, 220));
      if (note) doc.font(font).fontSize(10).fillColor("#5f6673").text(note.slice(0, 500));
      doc.moveDown(0.4);
    };

    section("Feeding");
    if (report.entries.feeding.length) {
      report.entries.feeding.forEach((entry) => line(entry.dateTime, `${foodLabels[entry.foodType] ?? entry.foodType} · ${entry.amount}`, entry.note));
    } else empty();

    section("Symptoms");
    if (report.entries.symptoms.length) {
      report.entries.symptoms.forEach((entry) => line(entry.dateTime, `${symptomLabels[entry.symptomType] ?? entry.symptomType} · severity ${entry.severity}/5`, entry.note));
    } else empty();

    section("Medicines");
    if (report.entries.medicines.length) {
      report.entries.medicines.forEach((entry) => line(entry.dateTime, `${entry.medicineName} · ${entry.dosage} · ${entry.taken ? "taken" : "not taken"}`, entry.note));
    } else empty();

    section("Weight");
    if (report.entries.weights.length) {
      report.entries.weights.forEach((entry) => line(entry.date, `${entry.weightKg.toString()} kg`));
    } else empty();

    section("Notes");
    if (report.entries.notes.length) {
      report.entries.notes.forEach((entry) => line(entry.dateTime, entry.note));
    } else empty();

    doc.moveDown(1);
    doc.font(font).fontSize(9).fillColor("#8a91a0").text(
      "PetCare Diary does not replace veterinary care. If symptoms repeat or condition worsens, contact a veterinarian.",
      { align: "left" }
    );
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
      recentNotes: report.entries.notes.slice(0, 10)
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

    const body = await renderReportPdf(report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="petcare-report-${query.period === "all" ? "all" : `${query.period}d`}.pdf"`);
    res.send(body);
  } catch (error) {
    next(error);
  }
});

export default router;
