import { prisma } from "../prisma/client.js";
import { HttpError } from "./httpError.js";

export async function assertPetBelongsToUser(petId: string, userId: string) {
  const pet = await prisma.pet.findFirst({ where: { id: petId, userId } });
  if (!pet) throw new HttpError(404, "PET_NOT_FOUND", "Pet not found.");
  return pet;
}
