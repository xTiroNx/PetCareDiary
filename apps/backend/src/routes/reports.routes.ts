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

const reportQuerySchema = z.object({
  petId: z.string().min(1).max(128),
  period: z.preprocess(
    (value) => value === "all" ? "all" : Number(value),
    z.union([z.literal("all"), z.number().int().refine((value) => [7, 14, 30].includes(value))])
  )
}).strict();

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function buildReport(userId: string, petId: string, period: number | "all") {
  const from = period === "all" ? null : new Date(Date.now() - period * 24 * 60 * 60 * 1000);
  const pet = await prisma.pet.findFirst({ where: { id: petId, userId } });
  const dateFilter = from ? { gte: from } : undefined;
  const [feeding, symptoms, medicines, medicinesTaken, weights, notes, recentNotes] = await Promise.all([
    prisma.feedingEntry.count({ where: { userId, petId, dateTime: dateFilter } }),
    prisma.symptomEntry.count({ where: { userId, petId, dateTime: dateFilter } }),
    prisma.medicineEntry.count({ where: { userId, petId, dateTime: dateFilter } }),
    prisma.medicineEntry.count({ where: { userId, petId, dateTime: dateFilter, taken: true } }),
    prisma.weightEntry.count({ where: { userId, petId, date: dateFilter } }),
    prisma.noteEntry.count({ where: { userId, petId, dateTime: dateFilter } }),
    prisma.noteEntry.findMany({
      where: { userId, petId, dateTime: dateFilter },
      select: { id: true, note: true, dateTime: true },
      orderBy: { dateTime: "desc" },
      take: 10
    })
  ]);

  const counts = { feeding, symptoms, medicines, medicinesTaken, weights, notes };
  return { period, from, petName: pet?.name ?? "Pet", counts, recentNotes };
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

    doc.moveDown(1);
    doc.fillColor("#17202a").fontSize(15).text("Recent notes");
    doc.moveDown(0.5);
    if (report.recentNotes.length) {
      report.recentNotes.forEach((entry, index) => {
        doc.font(font).fontSize(10).fillColor("#5f6673").text(`${index + 1}. ${new Date(entry.dateTime).toLocaleString("ru-RU")}`);
        doc.font(font).fontSize(11).fillColor("#17202a").text(entry.note.slice(0, 600));
        doc.moveDown(0.4);
      });
    } else {
      doc.font(font).fontSize(11).fillColor("#5f6673").text("No notes for this period.");
    }

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
    const report = await buildReport(req.user!.id, query.petId, query.period);
    res.json(serialize({
      period: report.period,
      from: report.from,
      petName: report.petName,
      counts: report.counts,
      recentNotes: report.recentNotes
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
      const built = await buildReport(req.user!.id, query.petId, query.period);
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
