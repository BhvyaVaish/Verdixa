import { z } from "zod";

/**
 * Common shared Zod schemas and validation utilities.
 */
export const IdSchema = z.string().min(1);

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
