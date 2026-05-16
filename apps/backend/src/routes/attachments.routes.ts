import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import {
  assertAttachableEntry,
  attachmentPath,
  deleteAttachmentFile,
  isAttachmentEntryType,
  serializeAttachment,
  writeAttachmentFile
} from "../services/attachments.service.js";
import { HttpError } from "../utils/httpError.js";
import { idParamSchema } from "../utils/validation.js";

const router = Router();

const allowedMimeTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf"
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: Math.ceil(env.ATTACHMENTS_MAX_FILE_MB * 1024 * 1024)
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes[file.mimetype]) {
      return cb(new HttpError(400, "ATTACHMENT_FILE_UNSUPPORTED", "Unsupported attachment file type."));
    }
    return cb(null, true);
  }
});

const entryTypeSchema = z.enum(["FEEDING", "WATER", "SYMPTOM", "MEDICINE", "WEIGHT", "VACCINATION", "NOTE"]);

const attachmentEntrySchema = z.object({
  petId: z.string().min(1).max(128),
  entryType: entryTypeSchema,
  entryId: z.string().min(1).max(128)
}).strict();

function normalizeUploadError(error: unknown) {
  if (error instanceof HttpError) return error;
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new HttpError(413, "ATTACHMENT_FILE_TOO_LARGE", "Attachment file is too large.");
    }
    return new HttpError(400, "ATTACHMENT_UPLOAD_INVALID", "Attachment upload is invalid.");
  }
  return error;
}

function uploadAttachment(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error) => {
    if (error) return next(normalizeUploadError(error));
    return next();
  });
}

function safeFileName(value: string) {
  const fallback = "attachment";
  const normalized = path.basename(value || fallback).replace(/[^\w.\- ()а-яёА-ЯЁ]+/g, "_").slice(0, 160);
  return normalized || fallback;
}

function attachmentStorageKey(input: {
  userId: string;
  entryType: string;
  entryId: string;
  mimeType: string;
}) {
  const ext = allowedMimeTypes[input.mimeType] ?? "bin";
  return `${input.userId}/${input.entryType}/${input.entryId}/${crypto.randomUUID()}.${ext}`;
}

function contentDisposition(fileName: string) {
  return `inline; filename="${safeFileName(fileName).replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

router.get("/", async (req, res, next) => {
  try {
    const query = attachmentEntrySchema.parse(req.query);
    await assertAttachableEntry({ ...query, userId: req.user!.id });
    const attachments = await prisma.attachment.findMany({
      where: { userId: req.user!.id, petId: query.petId, entryType: query.entryType, entryId: query.entryId },
      orderBy: { createdAt: "asc" }
    });
    res.json(attachments.map(serializeAttachment));
  } catch (error) {
    next(error);
  }
});

router.post("/", uploadAttachment, async (req, res, next) => {
  let storageKey: string | null = null;
  try {
    const body = attachmentEntrySchema.parse(req.body);
    if (!isAttachmentEntryType(body.entryType)) {
      throw new HttpError(400, "ATTACHMENT_ENTRY_TYPE_INVALID", "Attachment entry type is invalid.");
    }
    const file = req.file;
    if (!file) throw new HttpError(400, "ATTACHMENT_FILE_REQUIRED", "Attachment file is required.");
    await assertAttachableEntry({ ...body, userId: req.user!.id });

    const count = await prisma.attachment.count({
      where: { userId: req.user!.id, petId: body.petId, entryType: body.entryType, entryId: body.entryId }
    });
    if (count >= env.ATTACHMENTS_MAX_PER_ENTRY) {
      throw new HttpError(429, "ATTACHMENT_LIMIT_REACHED", "Attachment limit for this entry is reached.");
    }

    storageKey = attachmentStorageKey({
      userId: req.user!.id,
      entryType: body.entryType,
      entryId: body.entryId,
      mimeType: file.mimetype
    });
    await writeAttachmentFile(storageKey, file.buffer);
    const attachment = await prisma.attachment.create({
      data: {
        userId: req.user!.id,
        petId: body.petId,
        entryType: body.entryType,
        entryId: body.entryId,
        fileName: safeFileName(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey
      }
    });
    res.status(201).json(serializeAttachment(attachment));
  } catch (error) {
    if (storageKey) await deleteAttachmentFile(storageKey).catch(() => undefined);
    next(normalizeUploadError(error));
  }
});

router.get("/:id/file", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const attachment = await prisma.attachment.findFirst({ where: { id, userId: req.user!.id } });
    if (!attachment) throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found.");

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Length", String(attachment.sizeBytes));
    res.setHeader("Content-Disposition", contentDisposition(attachment.fileName));
    res.setHeader("Cache-Control", "private, no-store");
    fs.createReadStream(attachmentPath(attachment.storageKey))
      .on("error", () => next(new HttpError(404, "ATTACHMENT_FILE_NOT_FOUND", "Attachment file not found.")))
      .pipe(res);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const attachment = await prisma.attachment.findFirst({ where: { id, userId: req.user!.id } });
    if (!attachment) throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found.");
    await deleteAttachmentFile(attachment.storageKey);
    await prisma.attachment.delete({ where: { id: attachment.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
