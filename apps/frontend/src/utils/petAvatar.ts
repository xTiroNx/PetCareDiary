import { api, API_URL, apiFormData } from "../api/client";
import type { Pet } from "../api/types";
import { maxAttachmentSizeBytes } from "./attachments";

export const avatarAccept = "image/jpeg,image/png,image/webp";

const supportedAvatarMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSupportedAvatarFile(file: File) {
  return supportedAvatarMimeTypes.has(file.type);
}

export function petAvatarPath(petId: string, avatarUpdatedAt?: string | null) {
  return `/api/pets/${encodeURIComponent(petId)}/avatar/file?v=${encodeURIComponent(avatarUpdatedAt ?? "")}`;
}

export function petAvatarUrl(petId: string, avatarUpdatedAt?: string | null) {
  return new URL(petAvatarPath(petId, avatarUpdatedAt), API_URL).toString();
}

export function uploadPetAvatar(petId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return apiFormData<Pet | undefined>(`/api/pets/${encodeURIComponent(petId)}/avatar`, form);
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
