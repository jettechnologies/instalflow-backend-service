import { z } from "zod";

export const UpdateVariantStockSchema = z.object({
  stockQuantity: z.number().int().min(0),
});

export const DeactivateVariantSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().optional(),
});

export const CreateVariantSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1),
  size: z.string().optional(),
  color: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  stockQuantity: z.number().int().min(0).default(0),
  price: z.number().min(0),
});