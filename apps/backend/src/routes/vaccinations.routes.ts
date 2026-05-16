import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { deleteAttachmentsForEntry } from "../services/attachments.service.js";
import { hasAnyDiaryEntry, trackAnalyticsEvent } from "../services/analytics.service.js";
import { HttpError } from "../utils/httpError.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";
import { serialize } from "../utils/serialize.js";
import { idParamSchema } from "../utils/validation.js";

const router = Router();

const procedureTypes = ["VACCINE", "DEWORMING", "FLEA_TICK", "OTHER"] as const;

const vaccinationsQuerySchema = z.object({
  petId: z.string().min(1).max(128),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

const vaccinationBodySchema = z.object({
  petId: z.string().min(1).max(128),
  procedureType: z.enum(procedureTypes),
  title: z.string().trim().min(1).max(160),
  date: z.coerce.date(),
  nextDueDate: z.coerce.date().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  createReminder: z.boolean().optional()
}).strict();

function pageResponse<T>(items: T[], query: z.infer<typeof vaccinationsQuerySchema>) {
  if (!query.limit) return items;
  return {
    items: items.slice(0, query.limit),
    nextOffset: items.length > query.limit ? query.offset + query.limit : null
  };
}

function dateRange(query: z.infer<typeof vaccinationsQuerySchema>) {
  return {
    gte: query.from,
    lte: query.to
  };
}

function reminderTitle(title: string, procedureType: string) {
  return title.trim() || procedureType;
}

async function createVaccinationReminder(input: {
  userId: string;
  petId: string;
  title: string;
  procedureType: string;
  nextDueDate?: Date | null;
}) {
  if (!input.nextDueDate) return null;
  return prisma.reminder.create({
    data: {
      userId: input.userId,
      petId: input.petId,
      type: "VACCINATION",
      title: reminderTitle(input.title, input.procedureType),
      time: input.nextDueDate,
      repeatRule: null,
      active: true
    }
  });
}

router.get("/", async (req, res, next) => {
  try {
    const query = vaccinationsQuerySchema.parse(req.query);
    await assertPetBelongsToUser(query.petId, req.user!.id);
    const entries = await prisma.vaccinationEntry.findMany({
      where: { userId: req.user!.id, petId: query.petId, date: dateRange(query) },
      orderBy: { date: "desc" },
      ...(query.limit ? { skip: query.offset, take: query.limit + 1 } : {})
    });
    res.json(serialize(pageResponse(entries, query)));
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = vaccinationBodySchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const hadAnyEntry = await hasAnyDiaryEntry(req.user!.id);
    const { createReminder, ...entryData } = body;
    const entry = await prisma.vaccinationEntry.create({
      data: {
        ...entryData,
        nextDueDate: entryData.nextDueDate ?? null,
        note: entryData.note ?? null,
        userId: req.user!.id
      }
    });

    const reminder = createReminder
      ? await createVaccinationReminder({
          userId: req.user!.id,
          petId: body.petId,
          title: body.title,
          procedureType: body.procedureType,
          nextDueDate: body.nextDueDate
        })
      : null;

    const metadata = { petId: body.petId, entryId: entry.id, procedureType: entry.procedureType, reminderId: reminder?.id };
    await trackAnalyticsEvent({
      userId: req.user!.id,
      event: "vaccination_created",
      metadata
    });
    if (!hadAnyEntry) await trackAnalyticsEvent({ userId: req.user!.id, event: "first_entry_created", metadata });

    res.status(201).json(serialize({ ...entry, reminder }));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const body = vaccinationBodySchema.partial().parse(req.body);
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.vaccinationEntry.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new HttpError(404, "VACCINATION_NOT_FOUND", "Vaccination entry not found.");
    if (body.petId) await assertPetBelongsToUser(body.petId, req.user!.id);

    const { createReminder, ...entryData } = body;
    const updated = await prisma.vaccinationEntry.update({
      where: { id: existing.id },
      data: {
        ...entryData,
        ...(Object.prototype.hasOwnProperty.call(entryData, "nextDueDate") ? { nextDueDate: entryData.nextDueDate ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(entryData, "note") ? { note: entryData.note ?? null } : {})
      }
    });

    const reminder = createReminder
      ? await createVaccinationReminder({
          userId: req.user!.id,
          petId: updated.petId,
          title: updated.title,
          procedureType: updated.procedureType,
          nextDueDate: updated.nextDueDate
        })
      : null;

    res.json(serialize({ ...updated, reminder }));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.vaccinationEntry.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new HttpError(404, "VACCINATION_NOT_FOUND", "Vaccination entry not found.");
    await prisma.vaccinationEntry.delete({ where: { id: existing.id } });
    await deleteAttachmentsForEntry({ userId: req.user!.id, entryType: "VACCINATION", entryId: existing.id });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
