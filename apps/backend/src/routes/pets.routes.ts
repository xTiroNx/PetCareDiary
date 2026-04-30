import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { HttpError } from "../utils/httpError.js";
import { serialize } from "../utils/serialize.js";
import { idParamSchema } from "../utils/validation.js";

const router = Router();

const petSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["CAT", "DOG", "OTHER"]),
  weightKg: z.coerce.number().positive().optional().nullable(),
  ageYears: z.coerce.number().min(0).optional().nullable(),
  healthNotes: z.string().max(1000).optional().nullable()
}).strict();

router.get("/", async (req, res, next) => {
  try {
    const pets = await prisma.pet.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "asc" } });
    res.json(serialize(pets));
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = petSchema.parse(req.body);
    const pet = await prisma.pet.create({ data: { ...data, userId: req.user!.id } });
    res.status(201).json(serialize(pet));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const data = petSchema.partial().parse(req.body);
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.pet.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    const pet = await prisma.pet.update({ where: { id: existing.id }, data });
    res.json(serialize(pet));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.pet.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    await prisma.pet.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
