import { Router } from "express";
import { z } from "zod";
import { authenticateTelegram } from "../services/auth.service.js";
import { serialize } from "../utils/serialize.js";

const router = Router();
const authBodySchema = z.object({
  initData: z.string().min(1).max(8192),
  platform: z.string().trim().min(1).max(32).optional(),
  startParam: z.string().trim().min(1).max(128).optional(),
  languageCode: z.string().trim().min(1).max(16).optional()
}).strict();

router.post("/telegram", async (req, res, next) => {
  try {
    const body = authBodySchema.parse(req.body);
    const result = await authenticateTelegram(body.initData, {
      platform: body.platform,
      startParam: body.startParam,
      languageCode: body.languageCode
    });
    res.json(serialize(result));
  } catch (error) {
    next(error);
  }
});

export default router;
