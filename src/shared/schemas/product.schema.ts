import { z } from "zod";

export const ProductInstallmentPlanSchema = z.object({
  durationMonths: z.number().int().positive(),
  interestPercentage: z.number().min(0).default(0),
  active: z.boolean().default(true).optional(),
});

export const ProductVariantSchema = z.object({
  sku: z.string().min(1),
  size: z.string().optional(),
  color: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  stockQuantity: z.number().int().min(0).default(0),
  price: z.number().min(0),
});

export const CreateProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  price: z.number().min(0).default(0),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  stockQuantity: z.number().int().min(0).default(0),
  commissionRate: z.number().min(0).default(0),
  variants: z.array(ProductVariantSchema).optional(),
  installmentPlans: z.array(ProductInstallmentPlanSchema).optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial().extend({
  active: z.boolean().optional(),
});
