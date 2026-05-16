import fs from "node:fs/promises";
import path from "node:path";
import type { Attachment } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { HttpError } from "../utils/httpError.js";

export const attachmentEntryTypes = ["FEEDING", "WATER", "SYMPTOM", "MEDICINE", "WEIGHT", "VACCINATION", "NOTE"] as const;
export type AttachmentEntryType = typeof attachmentEntryTypes[number];

export function isAttachmentEntryType(value: string): value is AttachmentEntryType {
  return attachmentEntryTypes.includes(value as AttachmentEntryType);
}

export async function assertAttachableEntry(input: {
  userId: string;
  petId: string;
  entryType: AttachmentEntryType;
  entryId: string;
}) {
  const where = { id: input.entryId, userId: input.userId, petId: input.petId };
  const select = { id: true };

  const entry = await (async () => {
    if (input.entryType === "FEEDING") return prisma.feedingEntry.findFirst({ where, select });
    if (input.entryType === "WATER") return prisma.waterEntry.findFirst({ where, select });
    if (input.entryType === "SYMPTOM") return prisma.symptomEntry.findFirst({ where, select });
    if (input.entryType === "MEDICINE") return prisma.medicineEntry.findFirst({ where, select });
    if (input.entryType === "WEIGHT") return prisma.weightEntry.findFirst({ where, select });
    if (input.entryType === "VACCINATION") return prisma.vaccinationEntry.findFirst({ where, select });
    return prisma.noteEntry.findFirst({ where, select });
  })();

  if (!entry) throw new HttpError(404, "ATTACHMENT_ENTRY_NOT_FOUND", "Entry for attachment was not found.");
  return entry;
}

function attachmentBaseDir() {
  return path.resolve(env.ATTACHMENTS_LOCAL_DIR);
}

export function attachmentPath(storageKey: string) {
  const base = attachmentBaseDir();
  const fullPath = path.resolve(base, storageKey);
  if (!fullPath.startsWith(`${base}${path.sep}`)) {
    throw new HttpError(400, "ATTACHMENT_STORAGE_KEY_INVALID", "Attachment storage key is invalid.");
  }
  return fullPath;
}

export async function writeAttachmentFile(storageKey: string, buffer: Buffer) {
  const fullPath = attachmentPath(storageKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer, { flag: "wx" });
}

export async function deleteAttachmentFile(storageKey: string) {
  try {
    await fs.unlink(attachmentPath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function deleteAttachmentsForEntry(input: {
  userId: string;
  entryType: AttachmentEntryType;
  entryId: string;
}) {
  const attachments = await prisma.attachment.findMany({
    where: { userId: input.userId, entryType: input.entryType, entryId: input.entryId }
  });
  const results = await Promise.allSettled(attachments.map((attachment) => deleteAttachmentFile(attachment.storageKey)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(JSON.stringify({
        event: "attachment_file_cleanup_failed",
        attachmentId: attachments[index]?.id,
        entryType: input.entryType,
        entryId: input.entryId,
        error: result.reason instanceof Error ? result.reason.name : "unknown"
      }));
    }
  });
  if (attachments.length) {
    await prisma.attachment.deleteMany({
      where: { userId: input.userId, entryType: input.entryType, entryId: input.entryId }
    });
  }
}

export function serializeAttachment(attachment: Attachment) {
  return {
    id: attachment.id,
    entryType: attachment.entryType,
    entryId: attachment.entryId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt
  };
}
