import { api, apiBlob, apiFormData, DEMO_MODE, jsonBody } from "../api/client";

export type AttachmentEntryType = "FEEDING" | "WATER" | "SYMPTOM" | "MEDICINE" | "WEIGHT" | "VACCINATION" | "NOTE";

export const attachmentAccept = "image/jpeg,image/png,image/webp";
export const maxAttachmentSizeBytes = 5 * 1024 * 1024;

const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type AttachmentUploadPayload = {
  petId: string;
  entryType: AttachmentEntryType;
  entryId: string;
  file: File;
};

export type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type PresignedUpload = {
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
  storageKey: string;
};

type DirectDownload = {
  url: string;
};

export function isSupportedAttachmentFile(file: File) {
  return supportedMimeTypes.has(file.type);
}

export function attachmentFileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function uploadToSignedUrl(upload: PresignedUpload, file: File) {
  const response = await fetch(upload.uploadUrl, {
    method: upload.method,
    headers: upload.headers ?? { "Content-Type": file.type },
    body: file
  });
  if (!response.ok) {
    throw new Error("Direct file upload failed.");
  }
}

async function fetchDirectBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Direct file download failed.");
  return response.blob();
}

export async function fetchAttachmentBlob(attachmentId: string) {
  if (DEMO_MODE) return apiBlob(`/api/admin/attachments/${encodeURIComponent(attachmentId)}/file`);

  try {
    const download = await api<DirectDownload>(`/api/admin/attachments/${encodeURIComponent(attachmentId)}/file-url`);
    return fetchDirectBlob(download.url);
  } catch (error) {
    const requestError = error as Error & { code?: string };
    if (requestError.code === "ATTACHMENT_DIRECT_DOWNLOAD_UNAVAILABLE") {
      return apiBlob(`/api/admin/attachments/${encodeURIComponent(attachmentId)}/file`);
    }
    throw error;
  }
}

function uploadEntryAttachmentViaBackend({ petId, entryType, entryId, file }: AttachmentUploadPayload) {
  const form = new FormData();
  form.set("petId", petId);
  form.set("entryType", entryType);
  form.set("entryId", entryId);
  form.set("file", file);
  return apiFormData<Attachment>("/api/admin/attachments", form);
}

export async function uploadEntryAttachment(payload: AttachmentUploadPayload) {
  if (DEMO_MODE) return uploadEntryAttachmentViaBackend(payload);

  try {
    const upload = await api<PresignedUpload>("/api/admin/attachments/presign", {
      method: "POST",
      body: jsonBody({
        petId: payload.petId,
        entryType: payload.entryType,
        entryId: payload.entryId,
        fileName: payload.file.name,
        mimeType: payload.file.type,
        sizeBytes: payload.file.size
      })
    });
    await uploadToSignedUrl(upload, payload.file);
    return api<Attachment>("/api/admin/attachments/complete", {
      method: "POST",
      body: jsonBody({
        petId: payload.petId,
        entryType: payload.entryType,
        entryId: payload.entryId,
        fileName: payload.file.name,
        mimeType: payload.file.type,
        sizeBytes: payload.file.size,
        storageKey: upload.storageKey
      })
    });
  } catch (error) {
    const requestError = error as Error & { code?: string };
    if (requestError.code === "ATTACHMENT_DIRECT_UPLOAD_UNAVAILABLE") {
      return uploadEntryAttachmentViaBackend(payload);
    }
    throw error;
  }
}
