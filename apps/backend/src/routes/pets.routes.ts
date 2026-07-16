import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { hasAnyDiaryEntry, trackAnalyticsEvent } from "../services/analytics.service.js";
import {
  canUseDirectAttachmentStorage,
  createAttachmentDownloadUrl,
  createAttachmentUploadUrl,
  deleteAttachmentFile,
  readAttachmentFile,
  statAttachmentFile,
  writeAttachmentFile
} from "../services/attachments.service.js";
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

const avatarUploadMetadataSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.coerce.number().int().positive()
}).strict();

const avatarCompleteSchema = avatarUploadMetadataSchema.extend({
  storageKey: z.string().min(1).max(512)
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

function assertSupportedAvatarMetadata(input: { mimeType: string; sizeBytes: number }) {
  if (!avatarMimeTypes[input.mimeType]) {
    throw new HttpError(400, "PET_AVATAR_FILE_UNSUPPORTED", "Unsupported pet avatar file type.");
  }
  if (input.sizeBytes > env.ATTACHMENTS_MAX_FILE_MB * 1024 * 1024) {
    throw new HttpError(413, "PET_AVATAR_FILE_TOO_LARGE", "Pet avatar file is too large.");
  }
}

function assertAvatarStorageKey(input: { storageKey: string; userId: string; petId: string; mimeType: string }) {
  const expectedPrefix = `${input.userId}/pets/${input.petId}/avatar/`;
  const expectedExt = avatarMimeTypes[input.mimeType];
  if (!input.storageKey.startsWith(expectedPrefix) || !expectedExt || !input.storageKey.endsWith(`.${expectedExt}`)) {
    throw new HttpError(400, "PET_AVATAR_STORAGE_KEY_INVALID", "Pet avatar storage key is invalid.");
  }
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

router.get("/onboarding-progress", async (req, res, next) => {
  try {
    const [pet, hasDiaryEntry, reminder] = await Promise.all([
      prisma.pet.findFirst({ where: { userId: req.user!.id }, select: { id: true } }),
      hasAnyDiaryEntry(req.user!.id),
      prisma.reminder.findFirst({ where: { userId: req.user!.id }, select: { id: true } })
    ]);
    res.json({ hasPet: Boolean(pet), hasDiaryEntry, hasReminder: Boolean(reminder) });
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

router.post("/:id/avatar/presign", async (req, res, next) => {
  try {
    if (!canUseDirectAttachmentStorage()) {
      throw new HttpError(503, "PET_AVATAR_DIRECT_UPLOAD_UNAVAILABLE", "Direct pet avatar upload is available only with R2 storage.");
    }
    const { id } = idParamSchema.parse(req.params);
    const body = avatarUploadMetadataSchema.parse(req.body);
    assertSupportedAvatarMetadata(body);
    const existing = await prisma.pet.findFirst({ where: { id, userId: req.user!.id }, select: petSelect });
    if (!existing) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");

    const storageKey = avatarStorageKey({ userId: req.user!.id, petId: existing.id, mimeType: body.mimeType });
    const uploadUrl = await createAttachmentUploadUrl(storageKey, body.mimeType);
    res.json({
      uploadUrl,
      method: "PUT",
      headers: { "Content-Type": body.mimeType },
      storageKey,
      expiresInSeconds: env.FILE_STORAGE_SIGNED_URL_TTL_SECONDS
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/avatar/complete", async (req, res, next) => {
  let newStorageKey: string | null = null;
  try {
    if (!canUseDirectAttachmentStorage()) {
      throw new HttpError(503, "PET_AVATAR_DIRECT_UPLOAD_UNAVAILABLE", "Direct pet avatar upload is available only with R2 storage.");
    }
    const { id } = idParamSchema.parse(req.params);
    const body = avatarCompleteSchema.parse(req.body);
    assertSupportedAvatarMetadata(body);
    const existing = await prisma.pet.findFirst({ where: { id, userId: req.user!.id }, select: petSelect });
    if (!existing) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    assertAvatarStorageKey({ ...body, userId: req.user!.id, petId: existing.id });
    newStorageKey = body.storageKey;

    const storedFile = await statAttachmentFile(newStorageKey);
    if (!storedFile) throw new HttpError(400, "PET_AVATAR_UPLOAD_NOT_FOUND", "Uploaded pet avatar file was not found.");
    if (storedFile.sizeBytes !== null && storedFile.sizeBytes !== body.sizeBytes) {
      throw new HttpError(400, "PET_AVATAR_UPLOAD_SIZE_MISMATCH", "Uploaded pet avatar file size does not match metadata.");
    }

    const oldStorageKey = existing.avatarStorageKey;
    const updated = await prisma.pet.update({
      where: { id: existing.id },
      data: {
        avatarStorageKey: newStorageKey,
        avatarMimeType: body.mimeType,
        avatarFileName: safeFileName(body.fileName),
        avatarSizeBytes: body.sizeBytes,
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
    await writeAttachmentFile(newStorageKey, file.buffer, file.mimetype);

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

router.get("/:id/avatar/file-url", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const pet = await prisma.pet.findFirst({ where: { id, userId: req.user!.id }, select: petSelect });
    if (!pet) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    if (!pet.avatarStorageKey || !pet.avatarMimeType) throw new HttpError(404, "PET_AVATAR_NOT_FOUND", "Pet avatar not found.");
    if (!canUseDirectAttachmentStorage()) {
      throw new HttpError(503, "PET_AVATAR_DIRECT_DOWNLOAD_UNAVAILABLE", "Direct pet avatar download is available only with R2 storage.");
    }
    const storedFile = await statAttachmentFile(pet.avatarStorageKey);
    if (!storedFile) {
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
    const downloadUrl = await createAttachmentDownloadUrl({
      storageKey: pet.avatarStorageKey,
      contentType: pet.avatarMimeType,
      contentDisposition: contentDisposition(pet.avatarFileName)
    });
    res.json({ url: downloadUrl, expiresInSeconds: env.FILE_STORAGE_SIGNED_URL_TTL_SECONDS });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/avatar/file", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const pet = await prisma.pet.findFirst({ where: { id, userId: req.user!.id }, select: petSelect });
    if (!pet) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
    if (!pet.avatarStorageKey || !pet.avatarMimeType) throw new HttpError(404, "PET_AVATAR_NOT_FOUND", "Pet avatar not found.");

    if (canUseDirectAttachmentStorage()) {
      const storedFile = await statAttachmentFile(pet.avatarStorageKey);
      if (!storedFile) {
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
      const downloadUrl = await createAttachmentDownloadUrl({
        storageKey: pet.avatarStorageKey,
        contentType: pet.avatarMimeType,
        contentDisposition: contentDisposition(pet.avatarFileName)
      });
      res.redirect(302, downloadUrl);
      return;
    }

    const storedFile = await readAttachmentFile(pet.avatarStorageKey);
    if (!storedFile) {
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
    if (storedFile.sizeBytes !== null) res.setHeader("Content-Length", String(storedFile.sizeBytes));
    res.setHeader("Content-Disposition", contentDisposition(pet.avatarFileName));
    res.setHeader("Cache-Control", "private, no-store");
    storedFile.stream
      .on("error", () => {
        if (!res.headersSent) next(new HttpError(404, "PET_AVATAR_FILE_NOT_FOUND", "Pet avatar file not found."));
        else res.destroy();
      })
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
