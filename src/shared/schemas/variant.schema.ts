import { z } from "zod";

export const CreateVariantSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1).max(100),
  price: z.coerce.number().positive(),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  size: z.string().optional(),
  color: z.array(z.string()).optional().default([]),
  attributes: z.record(z.string(), z.any()).optional(),
  imageIds: z.array(z.number().int().positive()).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

export const UpdateVariantSchema = CreateVariantSchema.omit({
  productId: true,
}).partial();

export const UpdateVariantStockSchema = z.object({
  stockQuantity: z.number().int().min(0),
});

export const DeactivateVariantSchema = z.object({
  isActive: z.boolean(),
});

export const BulkCreateVariantSchema = CreateVariantSchema.omit({
  productId: true,
});

export const BulkCreateVariantsSchema = z.object({
  variants: z.array(BulkCreateVariantSchema).min(1).max(100),
});

export type BulkCreateVariantsInput = z.infer<typeof BulkCreateVariantsSchema>;
export type CreateVariantInput = z.infer<typeof CreateVariantSchema>;
export type UpdateVariantInput = z.infer<typeof UpdateVariantSchema>;
export type UpdateVariantStockInput = z.infer<typeof UpdateVariantStockSchema>;
export type DeactivateVariantInput = z.infer<typeof DeactivateVariantSchema>;
