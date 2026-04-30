import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { HttpError } from "../utils/httpError.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";
import { serialize } from "../utils/serialize.js";
import { idParamSchema, petIdQuerySchema } from "../utils/validation.js";

const router = Router();

const rangeQuery = z.object({
  petId: z.string().min(1).max(128),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

const feedingBodySchema = z.object({
  petId: z.string().min(1).max(128),
  dateTime: z.coerce.date(),
  foodType: z.enum(["DRY", "WET", "NATURAL", "TREAT", "OTHER"]),
  amount: z.string().min(1).max(80),
  note: z.string().max(1000).optional().nullable()
}).strict();

const symptomBodySchema = z.object({
  petId: z.string().min(1).max(128),
  dateTime: z.coerce.date(),
  symptomType: z.enum(["VOMITING", "YELLOW_VOMIT", "NO_APPETITE", "DIARRHEA", "CONSTIPATION", "LETHARGY", "PAIN", "OTHER"]),
  severity: z.coerce.number().int().min(1).max(5),
  note: z.string().max(1000).optional().nullable()
}).strict();

const medicineBodySchema = z.object({
  petId: z.string().min(1).max(128),
  medicineName: z.string().min(1).max(120),
  dosage: z.string().min(1).max(80),
  dateTime: z.coerce.date(),
  taken: z.boolean().optional(),
  note: z.string().max(1000).optional().nullable()
}).strict();

const weightBodySchema = z.object({
  petId: z.string().min(1).max(128),
  date: z.coerce.date(),
  weightKg: z.coerce.number().positive()
}).strict();

const noteBodySchema = z.object({
  petId: z.string().min(1).max(128),
  dateTime: z.coerce.date(),
  note: z.string().min(1).max(2000)
}).strict();

function dateRange(query: z.infer<typeof rangeQuery>) {
  return {
    gte: query.from,
    lte: query.to
  };
}

async function assertEntry<T extends { id: string }>(entry: T | null) {
  if (!entry) throw new HttpError(404, "ENTRY_NOT_FOUND", "Entry not found.");
  return entry;
}

function pageArgs(query: z.infer<typeof rangeQuery>): { skip?: number; take?: number } {
  return query.limit ? { skip: query.offset, take: query.limit + 1 } : {};
}

function pageResponse<T>(items: T[], query: z.infer<typeof rangeQuery>) {
  if (!query.limit) return items;
  const visibleItems = items.slice(0, query.limit);
  const hasMore = items.length > query.limit;
  return {
    items: visibleItems,
    nextOffset: hasMore ? query.offset + query.limit : null
  };
}

router.get("/feeding", async (req, res, next) => {
  try {
    const query = rangeQuery.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const entries = await prisma.feedingEntry.findMany({
      where: { userId: req.user!.id, petId: query.petId, dateTime: dateRange(query) },
      orderBy: { dateTime: "desc" },
      ...pageArgs(query)
    });
    res.json(serialize(pageResponse(entries, query)));
  } catch (error) {
    next(error);
  }
});

router.post("/feeding", async (req, res, next) => {
  try {
    const body = feedingBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const entry = await prisma.feedingEntry.create({ data: { ...body, userId: req.user!.id } });
    res.status(201).json(serialize(entry));
  } catch (error) {
    next(error);
  }
});

router.patch("/feeding/:id", async (req, res, next) => {
  try {
    const body = feedingBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.feedingEntry.findFirst({ where: { id, userId: req.user!.id } }));
    const updated = await prisma.feedingEntry.update({ where: { id: entry.id }, data: body });
    res.json(serialize(updated));
  } catch (error) {
    next(error);
  }
});

router.delete("/feeding/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.feedingEntry.findFirst({ where: { id, userId: req.user!.id } }));
    await prisma.feedingEntry.delete({ where: { id: entry.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/symptoms", async (req, res, next) => {
  try {
    const query = rangeQuery.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const entries = await prisma.symptomEntry.findMany({
      where: { userId: req.user!.id, petId: query.petId, dateTime: dateRange(query) },
      orderBy: { dateTime: "desc" },
      ...pageArgs(query)
    });
    res.json(serialize(pageResponse(entries, query)));
  } catch (error) {
    next(error);
  }
});

router.post("/symptoms", async (req, res, next) => {
  try {
    const body = symptomBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const entry = await prisma.symptomEntry.create({ data: { ...body, userId: req.user!.id } });
    res.status(201).json(serialize(entry));
  } catch (error) {
    next(error);
  }
});

router.patch("/symptoms/:id", async (req, res, next) => {
  try {
    const body = symptomBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.symptomEntry.findFirst({ where: { id, userId: req.user!.id } }));
    const updated = await prisma.symptomEntry.update({ where: { id: entry.id }, data: body });
    res.json(serialize(updated));
  } catch (error) {
    next(error);
  }
});

router.delete("/symptoms/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.symptomEntry.findFirst({ where: { id, userId: req.user!.id } }));
    await prisma.symptomEntry.delete({ where: { id: entry.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/symptoms/analytics", async (req, res, next) => {
  try {
    const query = petIdQuerySchema.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await prisma.symptomEntry.groupBy({
      by: ["symptomType"],
      where: { userId: req.user!.id, petId: query.petId, dateTime: { gte: from } },
      _count: { symptomType: true }
    });
    res.json(rows.map((row) => ({ symptomType: row.symptomType, count: row._count.symptomType })));
  } catch (error) {
    next(error);
  }
});

router.get("/medicines", async (req, res, next) => {
  try {
    const query = rangeQuery.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const entries = await prisma.medicineEntry.findMany({
      where: { userId: req.user!.id, petId: query.petId, dateTime: dateRange(query) },
      orderBy: { dateTime: "desc" },
      ...pageArgs(query)
    });
    res.json(serialize(pageResponse(entries, query)));
  } catch (error) {
    next(error);
  }
});

router.post("/medicines", async (req, res, next) => {
  try {
    const body = medicineBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const entry = await prisma.medicineEntry.create({ data: { ...body, userId: req.user!.id } });
    res.status(201).json(serialize(entry));
  } catch (error) {
    next(error);
  }
});

router.patch("/medicines/:id", async (req, res, next) => {
  try {
    const body = medicineBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.medicineEntry.findFirst({ where: { id, userId: req.user!.id } }));
    const updated = await prisma.medicineEntry.update({ where: { id: entry.id }, data: body });
    res.json(serialize(updated));
  } catch (error) {
    next(error);
  }
});

router.patch("/medicines/:id/taken", async (req, res, next) => {
  try {
    const body = z.object({ taken: z.boolean() }).strict().parse(req.body);
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.medicineEntry.findFirst({ where: { id, userId: req.user!.id } }));
    const updated = await prisma.medicineEntry.update({ where: { id: entry.id }, data: body });
    res.json(serialize(updated));
  } catch (error) {
    next(error);
  }
});

router.delete("/medicines/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.medicineEntry.findFirst({ where: { id, userId: req.user!.id } }));
    await prisma.medicineEntry.delete({ where: { id: entry.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/weights", async (req, res, next) => {
  try {
    const query = rangeQuery.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const entries = await prisma.weightEntry.findMany({
      where: { userId: req.user!.id, petId: query.petId, date: dateRange(query) },
      orderBy: { date: "desc" },
      ...pageArgs(query)
    });
    res.json(serialize(pageResponse(entries, query)));
  } catch (error) {
    next(error);
  }
});

router.post("/weights", async (req, res, next) => {
  try {
    const body = weightBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const entry = await prisma.weightEntry.create({ data: { ...body, userId: req.user!.id, weightKg: new Prisma.Decimal(body.weightKg) } });
    res.status(201).json(serialize(entry));
  } catch (error) {
    next(error);
  }
});

router.patch("/weights/:id", async (req, res, next) => {
  try {
    const body = weightBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.weightEntry.findFirst({ where: { id, userId: req.user!.id } }));
    const updated = await prisma.weightEntry.update({ where: { id: entry.id }, data: { ...body, weightKg: new Prisma.Decimal(body.weightKg) } });
    res.json(serialize(updated));
  } catch (error) {
    next(error);
  }
});

router.delete("/weights/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.weightEntry.findFirst({ where: { id, userId: req.user!.id } }));
    await prisma.weightEntry.delete({ where: { id: entry.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/notes", async (req, res, next) => {
  try {
    const query = rangeQuery.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const entries = await prisma.noteEntry.findMany({
      where: { userId: req.user!.id, petId: query.petId, dateTime: dateRange(query) },
      orderBy: { dateTime: "desc" },
      ...pageArgs(query)
    });
    res.json(serialize(pageResponse(entries, query)));
  } catch (error) {
    next(error);
  }
});

router.post("/notes", async (req, res, next) => {
  try {
    const body = noteBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const entry = await prisma.noteEntry.create({ data: { ...body, userId: req.user!.id } });
    res.status(201).json(serialize(entry));
  } catch (error) {
    next(error);
  }
});

router.patch("/notes/:id", async (req, res, next) => {
  try {
    const body = noteBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.noteEntry.findFirst({ where: { id, userId: req.user!.id } }));
    const updated = await prisma.noteEntry.update({ where: { id: entry.id }, data: body });
    res.json(serialize(updated));
  } catch (error) {
    next(error);
  }
});

router.delete("/notes/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const entry = await assertEntry(await prisma.noteEntry.findFirst({ where: { id, userId: req.user!.id } }));
    await prisma.noteEntry.delete({ where: { id: entry.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
