import { api, API_URL, apiBlob, apiFormData, DEMO_MODE, jsonBody } from "../api/client";
import type { Pet } from "../api/types";
import { maxAttachmentSizeBytes } from "./attachments";
import { compressImageFile } from "./imageCompression";

export const avatarAccept = "image/jpeg,image/png,image/webp";

const supportedAvatarMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSupportedAvatarFile(file: File) {
  return supportedAvatarMimeTypes.has(file.type);
}

async function preparePetAvatarFile(file: File) {
  const compressed = await compressImageFile(file, {
    maxWidth: 768,
    maxHeight: 768,
    quality: 0.8
  });
  if (compressed.size > maxAttachmentSizeBytes) {
    throw new Error("Image is too large. Max 5 MB.");
  }
  return compressed;
}

export function petAvatarPath(petId: string, avatarUpdatedAt?: string | null) {
  return `/api/pets/${encodeURIComponent(petId)}/avatar/file?v=${encodeURIComponent(avatarUpdatedAt ?? "")}`;
}

export function petAvatarUrl(petId: string, avatarUpdatedAt?: string | null) {
  return new URL(petAvatarPath(petId, avatarUpdatedAt), API_URL).toString();
}

type PresignedUpload = {
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
  storageKey: string;
};

type DirectDownload = {
  url: string;
};

async function fetchDirectBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Direct avatar download failed.");
  return response.blob();
}

export async function fetchPetAvatarBlob(petId: string, avatarUpdatedAt?: string | null) {
  if (DEMO_MODE) return apiBlob(petAvatarPath(petId, avatarUpdatedAt));

  try {
    const download = await api<DirectDownload | undefined>(`/api/pets/${encodeURIComponent(petId)}/avatar/file-url?v=${encodeURIComponent(avatarUpdatedAt ?? "")}`);
    if (!download?.url) return new Blob();
    return fetchDirectBlob(download.url);
  } catch (error) {
    const requestError = error as Error & { code?: string };
    if (requestError.code === "PET_AVATAR_DIRECT_DOWNLOAD_UNAVAILABLE") {
      return apiBlob(petAvatarPath(petId, avatarUpdatedAt));
    }
    throw error;
  }
}

async function uploadToSignedUrl(upload: PresignedUpload, file: File) {
  const response = await fetch(upload.uploadUrl, {
    method: upload.method,
    headers: upload.headers ?? { "Content-Type": file.type },
    body: file
  });
  if (!response.ok) {
    throw new Error("Direct avatar upload failed.");
  }
}

function uploadPetAvatarViaBackend(petId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return apiFormData<Pet | undefined>(`/api/pets/${encodeURIComponent(petId)}/avatar`, form);
}

export async function uploadPetAvatar(petId: string, file: File) {
  const preparedFile = await preparePetAvatarFile(file);

  if (DEMO_MODE) return uploadPetAvatarViaBackend(petId, preparedFile);

  try {
    const upload = await api<PresignedUpload>(`/api/pets/${encodeURIComponent(petId)}/avatar/presign`, {
      method: "POST",
      body: jsonBody({
        fileName: preparedFile.name,
        mimeType: preparedFile.type,
        sizeBytes: preparedFile.size
      })
    });
    await uploadToSignedUrl(upload, preparedFile);
    return api<Pet | undefined>(`/api/pets/${encodeURIComponent(petId)}/avatar/complete`, {
      method: "POST",
      body: jsonBody({
        fileName: preparedFile.name,
        mimeType: preparedFile.type,
        sizeBytes: preparedFile.size,
        storageKey: upload.storageKey
      })
    });
  } catch (error) {
    const requestError = error as Error & { code?: string };
    if (requestError.code === "PET_AVATAR_DIRECT_UPLOAD_UNAVAILABLE") {
      return uploadPetAvatarViaBackend(petId, preparedFile);
    }
    throw error;
  }
}

export function deletePetAvatar(petId: string) {
  return api<Pet | undefined>(`/api/pets/${encodeURIComponent(petId)}/avatar`, { method: "DELETE" });
}

export function withAvatarFallback(pet: Pet, hasAvatar: boolean): Pet {
  return {
    ...pet,
    hasAvatar,
    avatarUpdatedAt: hasAvatar ? new Date().toISOString() : null
  };
}

export { maxAttachmentSizeBytes as maxAvatarSizeBytes };
