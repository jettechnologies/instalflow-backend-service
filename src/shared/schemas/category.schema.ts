import { z } from "zod";

export const CreateCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional().nullable(),
});

export const UpdateCategorySchema = CreateCategorySchema.partial();
