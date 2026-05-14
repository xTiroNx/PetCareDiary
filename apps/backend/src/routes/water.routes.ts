import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { hasAnyDiaryEntry, trackAnalyticsEvent } from "../services/analytics.service.js";
import { HttpError } from "../utils/httpError.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";
import { serialize } from "../utils/serialize.js";
import { idParamSchema } from "../utils/validation.js";

const router = Router();

const waterQuerySchema = z.object({
  petId: z.string().min(1).max(128),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

const waterBodySchema = z.object({
  petId: z.string().min(1).max(128),
  dateTime: z.coerce.date(),
  amountMl: z.coerce.number().int().positive().max(50_000),
  note: z.string().max(1000).optional().nullable()
}).strict();

const waterAnalyticsQuerySchema = z.object({
  petId: z.string().min(1).max(128),
  days: z.coerce.number().int().refine((value) => [7, 14, 30, 90].includes(value)).default(7)
}).strict();

function dateRange(query: z.infer<typeof waterQuerySchema>) {
  return {
    gte: query.from,
    lte: query.to
  };
}

function pageResponse<T>(items: T[], query: z.infer<typeof waterQuerySchema>) {
  if (!query.limit) return items;
  return {
    items: items.slice(0, query.limit),
    nextOffset: items.length > query.limit ? query.offset + query.limit : null
  };
}

function utcDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

router.get("/", async (req, res, next) => {
  try {
    const query = waterQuerySchema.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const entries = await prisma.waterEntry.findMany({
      where: { userId: req.user!.id, petId: query.petId, dateTime: dateRange(query) },
      orderBy: { dateTime: "desc" },
      ...(query.limit ? { skip: query.offset, take: query.limit + 1 } : {})
    });
    res.json(serialize(pageResponse(entries, query)));
  } catch (error) {
    next(error);
  }
});

router.get("/analytics", async (req, res, next) => {
  try {
    const query = waterAnalyticsQuerySchema.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const from = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const entries = await prisma.waterEntry.findMany({
      where: { userId: req.user!.id, petId: query.petId, dateTime: { gte: from } },
      orderBy: { dateTime: "asc" },
      select: { id: true, dateTime: true, amountMl: true, note: true }
    });

    const totals = new Map<string, number>();
    for (const entry of entries) {
      const key = utcDayKey(entry.dateTime);
      totals.set(key, (totals.get(key) ?? 0) + entry.amountMl);
    }
    const totalMlByDay = Array.from(totals.entries()).map(([date, totalMl]) => ({ date, totalMl }));
    const totalMl = totalMlByDay.reduce((sum, day) => sum + day.totalMl, 0);
    const averagePerDay = query.days ? Math.round(totalMl / query.days) : 0;
    const latestDay = totalMlByDay.at(-1);
    const warningFlags: string[] = [];

    if (latestDay && averagePerDay > 0 && latestDay.totalMl > averagePerDay * 1.7) {
      warningFlags.push("latest_day_above_average");
    }
    if (latestDay && averagePerDay > 0 && latestDay.totalMl < averagePerDay * 0.4) {
      warningFlags.push("latest_day_below_average");
    }

    res.json(serialize({
      days: query.days,
      totalMl,
      averageMl: averagePerDay,
      entriesCount: entries.length,
      byDay: totalMlByDay,
      warnings: warningFlags,
      totalMlByDay,
      averagePerDay,
      latestEntries: entries.slice(-10).reverse(),
      warningFlags
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = waterBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const hadAnyEntry = await hasAnyDiaryEntry(req.user!.id);
    const entry = await prisma.waterEntry.create({
      data: { ...body, note: body.note ?? null, userId: req.user!.id }
    });
    const metadata = { petId: body.petId, entryId: entry.id, amountMl: entry.amountMl };
    await trackAnalyticsEvent({
      userId: req.user!.id,
      event: "water_created",
      metadata
    });
    if (!hadAnyEntry) await trackAnalyticsEvent({ userId: req.user!.id, event: "first_entry_created", metadata });
    res.status(201).json(serialize(entry));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const body = waterBodySchema.partial().parse(req.body);
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.waterEntry.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new HttpError(404, "WATER_ENTRY_NOT_FOUND", "Water entry not found.");
    if (body.petId) await assertPetBelongsToUser(body.petId, req.user!.id);
    const updated = await prisma.waterEntry.update({
      where: { id: existing.id },
      data: {
        ...body,
        ...(Object.prototype.hasOwnProperty.call(body, "note") ? { note: body.note ?? null } : {})
      }
    });
    res.json(serialize(updated));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.waterEntry.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new HttpError(404, "WATER_ENTRY_NOT_FOUND", "Water entry not found.");
    await prisma.waterEntry.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
