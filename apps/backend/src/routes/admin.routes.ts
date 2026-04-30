import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { accessEndsAt, getAccessStatus } from "../utils/access.js";
import { HttpError } from "../utils/httpError.js";
import { serialize } from "../utils/serialize.js";
import { idParamSchema } from "../utils/validation.js";

const router = Router();

const usersQuerySchema = z.object({
  telegramId: z.string().regex(/^\d+$/).max(32).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

const accessSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("MONTHLY"),
    days: z.coerce.number().int().min(1).max(3650).default(30)
  }).strict(),
  z.object({ mode: z.literal("LIFETIME") }).strict(),
  z.object({ mode: z.literal("REVOKE_PAID") }).strict(),
  z.object({ mode: z.literal("EXPIRE_ALL") }).strict()
]);

function publicUser(user: Awaited<ReturnType<typeof findUserById>>) {
  if (!user) return null;

  return {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    languageCode: user.languageCode,
    createdAt: user.createdAt,
    trialEndsAt: user.trialEndsAt,
    accessUntil: user.accessUntil,
    lifetimeAccess: user.lifetimeAccess,
    accessStatus: getAccessStatus(user),
    accessEndsAt: accessEndsAt(user),
    pet: user.pets[0] ?? null
  };
}

function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      pets: {
        select: { id: true, name: true, type: true },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });
}

router.get("/users", async (req, res, next) => {
  try {
    const query = usersQuerySchema.parse(req.query);
    const users = await prisma.user.findMany({
      where: query.telegramId ? { telegramId: BigInt(query.telegramId) } : undefined,
      include: {
        pets: {
          select: { id: true, name: true, type: true },
          orderBy: { createdAt: "asc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" },
      skip: query.telegramId ? 0 : query.offset,
      take: query.telegramId ? 1 : query.limit + 1
    });

    const items = users.slice(0, query.telegramId ? 1 : query.limit).map(publicUser);
    res.json(serialize({
      items,
      nextOffset: !query.telegramId && users.length > query.limit ? query.offset + query.limit : null
    }));
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id/access", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = accessSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User not found.");

    const now = new Date();
    if (data.mode === "MONTHLY") {
      const base = user.accessUntil && user.accessUntil > now ? user.accessUntil : now;
      const accessUntil = new Date(base.getTime() + data.days * 24 * 60 * 60 * 1000);
      await prisma.user.update({ where: { id }, data: { accessUntil } });
    }

    if (data.mode === "LIFETIME") {
      await prisma.user.update({ where: { id }, data: { lifetimeAccess: true } });
    }

    if (data.mode === "REVOKE_PAID") {
      await prisma.user.update({ where: { id }, data: { lifetimeAccess: false, accessUntil: null } });
    }

    if (data.mode === "EXPIRE_ALL") {
      await prisma.user.update({ where: { id }, data: { lifetimeAccess: false, accessUntil: null, trialEndsAt: now } });
    }

    const updated = await findUserById(id);
    console.info(JSON.stringify({
      event: "admin_access_change",
      adminUserId: req.user!.id,
      adminTelegramId: req.user!.telegramId.toString(),
      targetUserId: id,
      mode: data.mode,
      createdAt: now.toISOString()
    }));
    res.json(serialize(publicUser(updated)));
  } catch (error) {
    next(error);
  }
});

export default router;
