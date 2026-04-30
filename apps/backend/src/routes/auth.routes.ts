import { Router } from "express";
import { z } from "zod";
import { authenticateTelegram } from "../services/auth.service.js";
import { serialize } from "../utils/serialize.js";

const router = Router();
const authBodySchema = z.object({ initData: z.string().min(1).max(8192) }).strict();

router.post("/telegram", async (req, res, next) => {
  try {
    const { initData } = authBodySchema.parse(req.body);
    const result = await authenticateTelegram(initData);
    res.json(serialize(result));
  } catch (error) {
    next(error);
  }
});

export default router;
