import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { HttpError } from "../utils/httpError.js";
import { assertPetBelongsToUser } from "../utils/petOwnership.js";
import { serialize } from "../utils/serialize.js";
import { idParamSchema } from "../utils/validation.js";

const router = Router();
const repeatRuleSchema = z.preprocess(
  (value) => value === "" ? null : value,
  z.enum(["daily", "weekly", "monthly"]).optional().nullable()
);

const reminderSchema = z.object({
  petId: z.string().min(1),
  type: z.enum(["FEEDING", "MEDICINE", "WEIGHT", "VET", "OTHER"]),
  title: z.string().min(1).max(120),
  time: z.coerce.date(),
  repeatRule: repeatRuleSchema,
  active: z.boolean().optional()
}).strict();

const remindersQuerySchema = z.object({
  petId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

function pageResponse<T>(items: T[], query: z.infer<typeof remindersQuerySchema>) {
  if (!query.limit) return items;
  return {
    items: items.slice(0, query.limit),
    nextOffset: items.length > query.limit ? query.offset + query.limit : null
  };
}

router.get("/", async (req, res, next) => {
  try {
    const query = remindersQuerySchema.parse(req.query);
    if (query.petId) await assertPetBelongsToUser(query.petId, req.user!.id);
    const reminders = await prisma.reminder.findMany({
      where: { userId: req.user!.id, petId: query.petId },
      orderBy: { time: "asc" },
      ...(query.limit ? { skip: query.offset, take: query.limit + 1 } : {})
    });
    res.json(serialize(pageResponse(reminders, query)));
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = reminderSchema.parse(req.body);
    await assertPetBelongsToUser(body.petId, req.user!.id);
    const reminder = await prisma.reminder.create({ data: { ...body, repeatRule: body.repeatRule || null, userId: req.user!.id } });
    res.status(201).json(serialize(reminder));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const body = reminderSchema.partial().parse(req.body);
    const { id } = idParamSchema.parse(req.params);
    if (body.petId) await assertPetBelongsToUser(body.petId, req.user!.id);
    const existing = await prisma.reminder.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new HttpError(404, "REMINDER_NOT_FOUND", "Reminder not found.");
    const data = {
      ...body,
      ...(Object.prototype.hasOwnProperty.call(body, "repeatRule") ? { repeatRule: body.repeatRule || null } : {}),
      lastDeliveryError: null
    };
    const reminder = await prisma.reminder.update({
      where: { id: existing.id },
      data
    });
    res.json(serialize(reminder));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.reminder.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new HttpError(404, "REMINDER_NOT_FOUND", "Reminder not found.");
    await prisma.reminder.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
