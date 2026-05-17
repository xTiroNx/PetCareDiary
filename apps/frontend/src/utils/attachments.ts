import { apiFormData } from "../api/client";

export type AttachmentEntryType = "FEEDING" | "WATER" | "SYMPTOM" | "MEDICINE" | "WEIGHT" | "VACCINATION" | "NOTE";

export const attachmentAccept = "image/jpeg,image/png,image/webp,application/pdf";
export const maxAttachmentSizeBytes = 5 * 1024 * 1024;

const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type AttachmentUploadPayload = {
  petId: string;
  entryType: AttachmentEntryType;
  entryId: string;
  file: File;
};

export function isSupportedAttachmentFile(file: File) {
  return supportedMimeTypes.has(file.type);
}

export function attachmentFileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function uploadEntryAttachment({ petId, entryType, entryId, file }: AttachmentUploadPayload) {
  const form = new FormData();
  form.set("petId", petId);
  form.set("entryType", entryType);
  form.set("entryId", entryId);
  form.set("file", file);
  return apiFormData("/api/admin/attachments", form);
}
