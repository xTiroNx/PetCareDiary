import type { Attachment } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { HttpError } from "../utils/httpError.js";
import {
  createStoredFileDownloadUrl,
  createStoredFileUploadUrl,
  deleteStoredFile,
  isR2FileStorage,
  readStoredFile,
  statStoredFile,
  writeStoredFile
} from "./fileStorage.service.js";

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

export async function writeAttachmentFile(storageKey: string, buffer: Buffer, contentType?: string) {
  await writeStoredFile(storageKey, buffer, contentType);
}

export async function readAttachmentFile(storageKey: string) {
  return readStoredFile(storageKey);
}

export async function statAttachmentFile(storageKey: string) {
  return statStoredFile(storageKey);
}

export async function createAttachmentUploadUrl(storageKey: string, contentType: string) {
  return createStoredFileUploadUrl({ storageKey, contentType });
}

export async function createAttachmentDownloadUrl(input: {
  storageKey: string;
  contentType?: string;
  contentDisposition?: string;
}) {
  return createStoredFileDownloadUrl(input);
}

export async function deleteAttachmentFile(storageKey: string) {
  await deleteStoredFile(storageKey);
}

export function canUseDirectAttachmentStorage() {
  return isR2FileStorage();
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
