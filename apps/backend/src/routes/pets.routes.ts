import fs from "node:fs";
import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { trackAnalyticsEvent } from "../services/analytics.service.js";
import { attachmentPath, deleteAttachmentFile, writeAttachmentFile } from "../services/attachments.service.js";
import { HttpError } from "../utils/httpError.js";
import { publicPetSelect as petSelect, serializePet } from "../utils/petSerialization.js";
import { idParamSchema } from "../utils/validation.js";

const router = Router();
const avatarMimeTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: Math.ceil(env.ATTACHMENTS_MAX_FILE_MB * 1024 * 1024)
  },
  fileFilter: (_req, file, cb) => {
    if (!avatarMimeTypes[file.mimetype]) {
      return cb(new HttpError(400, "PET_AVATAR_FILE_UNSUPPORTED", "Unsupported pet avatar file type."));
    }
    return cb(null, true);
  }
});

const optionalNumber = z.preprocess(
  (value) => value === "" ? null : value,
  z.coerce.number().positive().optional().nullable()
);

const petSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["CAT", "DOG", "OTHER"]),
  weightKg: optionalNumber,
  ageYears: z.preprocess((value) => value === "" ? null : value, z.coerce.number().min(0).optional().nullable()),
  healthNotes: z.preprocess((value) => value === "" ? null : value, z.string().max(1000).optional().nullable())
}).strict();

function normalizeUploadError(error: unknown) {
  if (error instanceof HttpError) return error;
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new HttpError(413, "PET_AVATAR_FILE_TOO_LARGE", "Pet avatar file is too large.");
    }
    return new HttpError(400, "PET_AVATAR_UPLOAD_INVALID", "Pet avatar upload is invalid.");
  }
  return error;
}

function uploadAvatar(req: Request, res: Response, next: NextFunction) {
  avatarUpload.single("file")(req, res, (error) => {
    if (error) return next(normalizeUploadError(error));
    return next();
  });
}

function safeFileName(value: string) {
  const fallback = "avatar";
  const normalized = value.replace(/[^\w.\- ()а-яёА-ЯЁ]+/g, "_").slice(0, 160);
  return normalized || fallback;
}

function avatarStorageKey(input: { userId: string; petId: string; mimeType: string }) {
  const ext = avatarMimeTypes[input.mimeType] ?? "bin";
  return `${input.userId}/pets/${input.petId}/avatar/${crypto.randomUUID()}.${ext}`;
}

function contentDisposition(fileName: string | null | undefined) {
  const safeName = safeFileName(fileName || "avatar");
  return `inline; filename="${safeName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

router.get("/", async (req, res, next) => {
  try {
    const pets = await prisma.pet.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "asc" }, select: petSelect });
    res.json(pets.map(serializePet));
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = petSchema.parse(req.body);
    const pet = await prisma.pet.create({ data: { ...data, userId: req.user!.id }, select: petSelect });
    await trackAnalyticsEvent({
      userId: req.user!.id,
      event: "pet_created",
      metadata: { petId: pet.id, petType: pet.type }
    });
    res.status(201).json(serializePet(pet));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/avatar", uploadAvatar, async (req, res, next) => {
  let newStorageKey: string | null = null;
  try {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.pet.findFirst({ where: { id, userId: req.user!.id }, select: petSelect });
    if (!existing) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    const file = req.file;
    if (!file) throw new HttpError(400, "PET_AVATAR_FILE_REQUIRED", "Pet avatar file is required.");

    const oldStorageKey = existing.avatarStorageKey;
    newStorageKey = avatarStorageKey({ userId: req.user!.id, petId: existing.id, mimeType: file.mimetype });
    await writeAttachmentFile(newStorageKey, file.buffer);

    const updated = await prisma.pet.update({
      where: { id: existing.id },
      data: {
        avatarStorageKey: newStorageKey,
        avatarMimeType: file.mimetype,
        avatarFileName: safeFileName(file.originalname),
        avatarSizeBytes: file.size,
        avatarUpdatedAt: new Date()
      },
      select: petSelect
    });

    if (oldStorageKey && oldStorageKey !== newStorageKey) {
      await deleteAttachmentFile(oldStorageKey).catch((error) => {
        console.warn(JSON.stringify({
          event: "pet_avatar_old_file_cleanup_failed",
          petId: existing.id,
          error: error instanceof Error ? error.name : "unknown"
        }));
      });
    }

    res.status(201).json(serializePet(updated));
  } catch (error) {
    if (newStorageKey) await deleteAttachmentFile(newStorageKey).catch(() => undefined);
    next(normalizeUploadError(error));
  }
});

router.get("/:id/avatar/file", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const pet = await prisma.pet.findFirst({ where: { id, userId: req.user!.id }, select: petSelect });
    if (!pet) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    if (!pet.avatarStorageKey || !pet.avatarMimeType) throw new HttpError(404, "PET_AVATAR_NOT_FOUND", "Pet avatar not found.");

    const filePath = attachmentPath(pet.avatarStorageKey);
    const stats = await fs.promises.stat(filePath).catch(() => null);
    if (!stats?.isFile()) {
      await prisma.pet.update({
        where: { id: pet.id },
        data: {
          avatarStorageKey: null,
          avatarMimeType: null,
          avatarFileName: null,
          avatarSizeBytes: null,
          avatarUpdatedAt: null
        }
      });
      res.status(204).send();
      return;
    }

    res.setHeader("Content-Type", pet.avatarMimeType);
    res.setHeader("Content-Length", String(stats.size));
    res.setHeader("Content-Disposition", contentDisposition(pet.avatarFileName));
    res.setHeader("Cache-Control", "private, no-store");
    fs.createReadStream(filePath)
      .on("error", () => next(new HttpError(404, "PET_AVATAR_FILE_NOT_FOUND", "Pet avatar file not found.")))
      .pipe(res);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/avatar", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.pet.findFirst({ where: { id, userId: req.user!.id }, select: petSelect });
    if (!existing) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    if (existing.avatarStorageKey) {
      await deleteAttachmentFile(existing.avatarStorageKey);
    }
    await prisma.pet.update({
      where: { id: existing.id },
      data: {
        avatarStorageKey: null,
        avatarMimeType: null,
        avatarFileName: null,
        avatarSizeBytes: null,
        avatarUpdatedAt: null
      }
    });
    res.status(204).send();
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
    const pet = await prisma.pet.update({ where: { id: existing.id }, data, select: petSelect });
    res.json(serializePet(pet));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.pet.findFirst({ where: { id, userId: req.user!.id }, select: petSelect });
    if (!existing) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    await prisma.pet.delete({ where: { id: existing.id } });
    if (existing.avatarStorageKey) {
      await deleteAttachmentFile(existing.avatarStorageKey).catch((error) => {
        console.warn(JSON.stringify({
          event: "pet_avatar_file_cleanup_failed",
          petId: existing.id,
          error: error instanceof Error ? error.name : "unknown"
        }));
      });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
