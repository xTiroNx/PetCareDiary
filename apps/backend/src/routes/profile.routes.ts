import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { serialize } from "../utils/serialize.js";

const router = Router();

const preferencesSchema = z.object({
  languageCode: z.enum(["ru", "en", "es", "fr", "de", "zh"])
}).strict();

router.patch("/preferences", async (req, res, next) => {
  try {
    const body = preferencesSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { languageCode: body.languageCode }
    });
    res.json(serialize({ languageCode: user.languageCode }));
  } catch (error) {
    next(error);
  }
});

export default router;
