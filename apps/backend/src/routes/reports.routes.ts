import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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
  const html = `
    <section>
      <h2>PetCare Diary report: ${escapeHtml(pet?.name ?? "Pet")} · ${period === "all" ? "all time" : `last ${period} days`}</h2>
      <p>Feedings: ${counts.feeding}</p>
      <p>Symptoms: ${counts.symptoms}</p>
      <p>Medicines: ${counts.medicines}, taken: ${counts.medicinesTaken}</p>
      <p>Weight records: ${counts.weights}</p>
      <p>Other notes: ${counts.notes}</p>
      <h3>Recent notes</h3>
      <ul>${recentNotes.map((entry) => `<li>${escapeHtml(entry.note)}</li>`).join("")}</ul>
    </section>
  `;

  return { period, from, petName: pet?.name ?? "Pet", counts, recentNotes, html };
}

function renderPdfMvpHtml(report: Awaited<ReturnType<typeof buildReport>>) {
  // MVP export: valid printable HTML served as an attachment with .pdf filename.
  // TODO: replace this renderer with Playwright/Puppeteer or PDFKit for binary application/pdf output.
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PetCare Diary Report</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; padding: 32px; }
      h1 { margin: 0 0 8px; }
      .meta { color: #667085; margin-bottom: 24px; }
      .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 24px 0; }
      .card { border: 1px solid #d8e2e7; border-radius: 8px; padding: 12px; }
      .num { font-size: 28px; font-weight: 800; }
      section { margin-top: 24px; }
      li { margin-bottom: 8px; }
    </style>
  </head>
  <body>
    <h1>PetCare Diary Report</h1>
    <p class="meta">Period: ${report.period === "all" ? "all time" : `last ${report.period} days`} · Generated: ${new Date().toLocaleString()}</p>
    <div class="grid">
      <div class="card"><div class="num">${report.counts.feeding}</div><div>Feedings</div></div>
      <div class="card"><div class="num">${report.counts.symptoms}</div><div>Symptoms</div></div>
      <div class="card"><div class="num">${report.counts.medicines}</div><div>Medicines</div></div>
      <div class="card"><div class="num">${report.counts.weights}</div><div>Weight</div></div>
      <div class="card"><div class="num">${report.counts.notes}</div><div>Notes</div></div>
    </div>
    ${report.html}
  </body>
</html>`;
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

    const body = renderPdfMvpHtml(report);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="petcare-report-${query.period === "all" ? "all" : `${query.period}d`}.pdf"`);
    res.send(body);
  } catch (error) {
    next(error);
  }
});

export default router;
