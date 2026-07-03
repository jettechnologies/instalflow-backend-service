import { prisma, Prisma, ProductStatus } from "@/infrastructure/prisma";
import { NotFoundError, BadRequestError } from "@/shared/utils/AppError";
import { ProductService } from "@/core/services/product.service";
import type {
  CreateVariantInput,
  UpdateVariantInput,
  UpdateVariantStockInput,
  DeactivateVariantInput,
} from "@/shared/schemas/variant.schema";
import type { BulkCreateVariantsInput } from "@/shared/schemas/variant.schema";

export class VariantService {
  static async getVariantsByProduct(productId: string) {
    return prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      include: {
        images: {
          orderBy: { sortOrder: "asc" },
          include: { image: true },
        },
      },
    });
  }

  static async getVariantById(variantId: string) {
    const variant = await prisma.productVariant.findUnique({
      where: { variantId },
      include: {
        product: true,
        financingContracts: {
          where: { status: { in: ["ACTIVE", "PENDING_ACTIVATION"] } },
          select: { contractId: true },
        },
        images: {
          orderBy: { sortOrder: "asc" },
          include: { image: true },
        },
      },
    });

    if (!variant) throw new NotFoundError("Variant not found");

    return variant;
  }

  static async addVariant(data: CreateVariantInput) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { productId: data.productId },
        select: { productId: true },
      });

      if (!product) throw new NotFoundError("Product not found");

      const existingSku = await tx.productVariant.findUnique({
        where: { sku: data.sku },
        select: { variantId: true },
      });

      if (existingSku) throw new BadRequestError("SKU already exists");

      const variant = await tx.productVariant.create({
        data: {
          productId: data.productId,
          sku: data.sku,
          size: data.size,
          color: data.color ?? [],
          ...(data.attributes !== undefined && {
            attributes: data.attributes,
          }),
          stockQuantity: data.stockQuantity ?? 0,
          price: data.price,
          isActive: data.isActive ?? true,
        },
      });

      if (data.imageIds?.length) {
        await tx.productVariantImage.createMany({
          data: data.imageIds.map((imageId, idx) => ({
            variantId: variant.id,
            imageId: BigInt(imageId),
            isPrimary: idx === 0,
            sortOrder: idx,
          })),
          skipDuplicates: true,
        });
      }

      await ProductService.syncStats(data.productId, tx);

      return tx.productVariant.findUnique({
        where: { variantId: variant.variantId },
        include: {
          images: {
            orderBy: { sortOrder: "asc" },
            include: { image: true },
          },
        },
      });
    });
  }

  static async updateVariant(variantId: string, data: UpdateVariantInput) {
    const variant = await prisma.productVariant.findUnique({
      where: { variantId },
      select: { id: true, productId: true, sku: true },
    });

    if (!variant) throw new NotFoundError("Variant not found");

    if (data.sku && data.sku !== variant.sku) {
      const skuTaken = await prisma.productVariant.findFirst({
        where: { sku: data.sku, variantId: { not: variantId } },
        select: { variantId: true },
      });

      if (skuTaken) throw new BadRequestError("SKU already exists");
    }

    return prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { variantId },
        data: {
          ...(data.sku !== undefined && { sku: data.sku }),
          ...(data.size !== undefined && { size: data.size }),
          ...(data.color !== undefined && { color: data.color }),
          ...(data.attributes !== undefined && { attributes: data.attributes }),
          ...(data.stockQuantity !== undefined && {
            stockQuantity: data.stockQuantity,
          }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });

      if (data.imageIds !== undefined) {
        await tx.productVariantImage.deleteMany({
          where: { variantId: variant.id },
        });

        if (data.imageIds.length > 0) {
          await tx.productVariantImage.createMany({
            data: data.imageIds.map((imageId, idx) => ({
              variantId: variant.id,
              imageId: BigInt(imageId),
              isPrimary: idx === 0,
              sortOrder: idx,
            })),
            skipDuplicates: true,
          });
        }
      }

      await ProductService.syncStats(variant.productId, tx);

      return tx.productVariant.findUnique({
        where: { variantId },
        include: {
          images: {
            orderBy: { sortOrder: "asc" },
            include: { image: true },
          },
        },
      });
    });
  }

  static async updateVariantStock(
    variantId: string,
    data: UpdateVariantStockInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { variantId },
        select: { variantId: true, productId: true },
      });

      if (!variant) throw new NotFoundError("Variant not found");

      await tx.productVariant.update({
        where: { variantId },
        data: { stockQuantity: data.stockQuantity },
      });

      await ProductService.syncStats(variant.productId, tx);

      return tx.productVariant.findUnique({ where: { variantId } });
    });
  }

  static async deactivateVariant(
    variantId: string,
    data: DeactivateVariantInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { variantId },
        include: {
          financingContracts: {
            where: { status: { in: ["ACTIVE", "PENDING_ACTIVATION"] } },
            select: { contractId: true },
          },
        },
      });

      if (!variant) throw new NotFoundError("Variant not found");

      if (!data.isActive && variant.financingContracts.length > 0) {
        throw new BadRequestError(
          "Cannot deactivate a variant with active financing contracts. " +
            "Restructure the contracts first.",
        );
      }

      const updated = await tx.productVariant.update({
        where: { variantId },
        data: { isActive: data.isActive },
      });

      await ProductService.syncStats(variant.productId, tx);

      return updated;
    });
  }

  static async removeVariant(variantId: string) {
    return prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { variantId },
        include: {
          financingContracts: {
            where: { status: { in: ["ACTIVE", "PENDING_ACTIVATION"] } },
            select: { contractId: true },
          },
        },
      });

      if (!variant) throw new NotFoundError("Variant not found");

      if (variant.financingContracts.length > 0) {
        throw new BadRequestError(
          "Cannot delete a variant with active financing contracts.",
        );
      }

      const productId = variant.productId;

      await tx.productVariant.delete({ where: { variantId } });
      await ProductService.syncStats(productId, tx);

      return { deleted: true, variantId };
    });
  }

  static async countActiveApplications(productId: string, variantId?: string) {
    return prisma.kycApplication.count({
      where: {
        productId,
        ...(variantId && { variantId }),
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
  }

  static async bulkCreateVariants(data: BulkCreateVariantsInput) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { productId: data.productId },
        select: { productId: true },
      });

      if (!product) throw new NotFoundError("Product not found");

      const skus = data.variants.map((v) => v.sku);
      const existingSkus = await tx.productVariant.findMany({
        where: { sku: { in: skus } },
        select: { sku: true },
      });

      if (existingSkus.length > 0) {
        const taken = existingSkus.map((v) => v.sku).join(", ");
        throw new BadRequestError(`SKU(s) already exist: ${taken}`);
      }

      const createdVariants = await tx.productVariant.createMany({
        data: data.variants.map((v) => ({
          productId: data.productId,
          sku: v.sku,
          size: v.size,
          color: v.color ?? [],
          ...(v.attributes !== undefined && { attributes: v.attributes }),
          stockQuantity: v.stockQuantity ?? 0,
          price: new Prisma.Decimal(v.price),
          isActive: v.isActive ?? true,
        })),
      });

      const variantsWithImages = data.variants.filter(
        (v) => v.imageIds?.length,
      );
      for (const variant of variantsWithImages) {
        const variantId = skus.indexOf(variant.sku);
        const variantRow = await tx.productVariant.findUnique({
          where: { sku: variant.sku },
          select: { id: true, variantId: true },
        });

        if (variantRow && variant.imageIds?.length) {
          await tx.productVariantImage.createMany({
            data: variant.imageIds.map((imageId, idx) => ({
              variantId: variantRow.id,
              imageId: BigInt(imageId),
              isPrimary: idx === 0,
              sortOrder: idx,
            })),
            skipDuplicates: true,
          });
        }
      }

      await ProductService.syncStats(data.productId, tx);

      const variants = await tx.productVariant.findMany({
        where: { productId: data.productId },
        orderBy: { createdAt: "desc" },
        include: {
          images: {
            orderBy: { sortOrder: "asc" },
            include: { image: true },
          },
        },
      });

      return { count: createdVariants.count, variants };
    });
  }
}
