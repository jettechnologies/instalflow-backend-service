import { z } from "zod";
import { ProductStatus } from "@/infrastructure/prisma";

export const InstallmentPlanInputSchema = z.object({
  durationMonths: z.number().int().positive(),
  interestPercentage: z.coerce.number().min(0).max(100),
  active: z.boolean().optional().default(true),
});

export const CreateProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
  commissionRate: z.coerce.number().min(0).max(100).default(0),
  status: z.nativeEnum(ProductStatus).optional().default(ProductStatus.DRAFT),
  price: z.coerce.number().min(0).default(0),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  installmentPlans: z.array(InstallmentPlanInputSchema).optional().default([]),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid().optional(),
  commissionRate: z.coerce.number().min(0).max(100).optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  price: z.coerce.number().min(0).optional(),
  stockQuantity: z.coerce.number().int().min(0).optional(),
});

export const ReorderGallerySchema = z.object({
  orderedIds: z.array(z.string().regex(/^\d+$/)).min(1),
});

export const UpdateImageMetaSchema = z.object({
  altText: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const ProductQueryParams = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  category: z.string().optional(),
  companyId: z.string().uuid().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export const ProductCursorQueryParams = z.object({
  limit: z.coerce.number().int().positive().max(100).default(10),
  cursor: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  category: z.string().optional(),
  companyId: z.string().uuid().optional(),
});

export const SearchQuerySchema = z.object({
  search: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
});

export const BulkVariantInputSchema = z.object({
  sku: z.string().min(1).max(100),
  price: z.coerce.number().positive(),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  size: z.string().optional(),
  color: z.array(z.string()).optional().default([]),
  attributes: z.record(z.string(), z.any()).optional(),
  imageIds: z.array(z.number().int().positive()).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

export const BulkProductInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
  commissionRate: z.coerce.number().min(0).max(100).default(0),
  status: z.nativeEnum(ProductStatus).optional().default(ProductStatus.DRAFT),
  price: z.coerce.number().min(0).default(0),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  installmentPlans: z.array(InstallmentPlanInputSchema).optional().default([]),
  variants: z.array(BulkVariantInputSchema).optional().default([]),
});

export const BulkProductsSchema = z.array(BulkProductInputSchema);

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export type ReorderGalleryInput = z.infer<typeof ReorderGallerySchema>;
export type UpdateImageMetaInput = z.infer<typeof UpdateImageMetaSchema>;
export type ProductQueryParamsInput = z.infer<typeof ProductQueryParams>;
export type ProductCursorQueryParamsInput = z.infer<
  typeof ProductCursorQueryParams
>;
export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
export type BulkCreateProductInput = z.infer<typeof BulkProductInputSchema>;
