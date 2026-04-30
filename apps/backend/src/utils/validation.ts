import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().min(1).max(128)
}).strict();

export const petIdQuerySchema = z.object({
  petId: z.string().min(1).max(128)
}).strict();

export const optionalPetIdQuerySchema = z.object({
  petId: z.string().min(1).max(128).optional()
}).strict();
