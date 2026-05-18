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

export const ProductImageSchema = z.object({
  imageUrl: z.string().min(1),
  altText: z.string().optional().nullable(),
  isPrimary: z.boolean().default(false).optional(),
  sortOrder: z.number().int().default(0).optional(),
  cloudinaryPublicId: z.string().optional().nullable(),
});

export const CreateProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  categoryId: z.string().min(1, "Category ID is required"),
  price: z.number().min(0).default(0),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  stockQuantity: z.number().int().min(0).default(0),
  commissionRate: z.number().min(0).default(0),
  variants: z.array(ProductVariantSchema).optional(),
  installmentPlans: z.array(ProductInstallmentPlanSchema).optional(),
  images: z.array(ProductImageSchema).optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial().extend({
  active: z.boolean().optional(),
});

export const SearchQuerySchema = z.object({
  search: z
    .string()
    .min(1, "Search query is required")
    .max(100, "Query too long")
    .regex(/^[a-zA-Z0-9\s\-_,.]+$/, "Invalid characters in search query"),

  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),

  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
});

export type SearchQueryType = z.infer<typeof SearchQuerySchema>;

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
  category?: string;
  companyId?: string;
}

export interface ProductCursorQueryParams {
  limit?: number;
  cursor?: string;
  sortOrder?: "asc" | "desc";
  category?: string;
  companyId?: string;
}


