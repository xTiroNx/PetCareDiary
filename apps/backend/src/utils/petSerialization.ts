import { Prisma } from "@prisma/client";
import { serialize } from "./serialize.js";

export const publicPetSelect = Prisma.validator<Prisma.PetSelect>()({
  id: true,
  userId: true,
  name: true,
  type: true,
  weightKg: true,
  ageYears: true,
  healthNotes: true,
  avatarStorageKey: true,
  avatarMimeType: true,
  avatarFileName: true,
  avatarSizeBytes: true,
  avatarUpdatedAt: true,
  createdAt: true,
  updatedAt: true
});

export type PublicPetRecord = Prisma.PetGetPayload<{ select: typeof publicPetSelect }>;

export function serializePet(pet: PublicPetRecord) {
  const {
    avatarStorageKey: _avatarStorageKey,
    avatarMimeType: _avatarMimeType,
    avatarFileName: _avatarFileName,
    avatarSizeBytes: _avatarSizeBytes,
    ...safePet
  } = pet;
  return serialize({
    ...safePet,
    hasAvatar: Boolean(pet.avatarStorageKey),
    avatarUpdatedAt: pet.avatarUpdatedAt ?? null
  });
}
