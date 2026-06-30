import { prisma } from "@/infrastructure/prisma";
import { z } from "zod";
import { NotFoundError, BadRequestError } from "@/shared/utils/AppError";
import { ProductStatus } from "@/infrastructure/prisma";

import {
  UpdateVariantStockSchema,
  DeactivateVariantSchema,
  CreateVariantSchema,
} from "@/shared/schemas/variant.schema";

export class VariantService {
  static async getVariantsByProduct(productId: string) {
    const variants = await prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
    });
    return variants;
  }

  static async getVariantById(variantId: string) {
    const variant = await prisma.productVariant.findUnique({
      where: { variantId },
      include: {
        product: true,
        financingContracts: {
          where: {
            status: {
              in: ["ACTIVE", "PENDING_ACTIVATION"],
            },
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    return variant;
  }

  static async updateVariantStock(
    variantId: string,
    data: z.infer<typeof UpdateVariantStockSchema>,
  ) {
    const variant = await prisma.productVariant.findUnique({
      where: { variantId },
      include: { product: true },
    });

    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    const updatedVariant = await prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({
        where: { variantId },
        data: { stockQuantity: data.stockQuantity },
      });

      if (data.stockQuantity === 0) {
        await this.checkAndSetProductSoldOut(variant.productId, tx);
      }

      return updated;
    });

    return updatedVariant;
  }

  static async deactivateVariant(
    variantId: string,
    data: z.infer<typeof DeactivateVariantSchema>,
  ) {
    const variant = await prisma.productVariant.findUnique({
      where: { variantId },
      include: {
        product: true,
        financingContracts: {
          where: {
            status: {
              in: ["ACTIVE", "PENDING_ACTIVATION"],
            },
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    if (variant.financingContracts.length > 0) {
      throw new BadRequestError(
        "Cannot deactivate variant with active financing contracts. Restructure contracts first.",
      );
    }

    const updated = await prisma.productVariant.update({
      where: { variantId },
      data: { isActive: data.isActive },
    });

    return updated;
  }

  static async addVariant(data: z.infer<typeof CreateVariantSchema>) {
    const product = await prisma.product.findUnique({
      where: { productId: data.productId },
    });

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    const existingSku = await prisma.productVariant.findUnique({
      where: { sku: data.sku },
    });

    if (existingSku) {
      throw new BadRequestError("SKU already exists");
    }

    return prisma.productVariant.create({
      data: {
        productId: data.productId,
        sku: data.sku,
        size: data.size,
        color: data.color,
        images: data.images,
        stockQuantity: data.stockQuantity,
        price: data.price,
        isActive: true,
      },
    });
  }

  static async updateVariant(
    variantId: string,
    data: Partial<z.infer<typeof CreateVariantSchema>>,
  ) {
    const variant = await prisma.productVariant.findUnique({
      where: { variantId },
    });

    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    if (data.sku) {
      const existingSku = await prisma.productVariant.findFirst({
        where: {
          sku: data.sku,
          variantId: { not: variantId },
        },
      });

      if (existingSku) {
        throw new BadRequestError("SKU already exists");
      }
    }

    const updateData: any = {
      ...(data.sku && { sku: data.sku }),
      ...(data.size !== undefined && { size: data.size }),
      ...(data.color && { color: data.color }),
      ...(data.images && { images: data.images }),
      ...(data.stockQuantity !== undefined && {
        stockQuantity: data.stockQuantity,
      }),
      ...(data.price !== undefined && { price: data.price }),
    };

    const updated = await prisma.productVariant.update({
      where: { variantId },
      data: updateData,
    });

    return updated;
  }

  private static async checkAndSetProductSoldOut(productId: string, tx: any) {
    const variants = await tx.productVariant.findMany({
      where: { productId },
      select: { stockQuantity: true, isActive: true },
    });

    const totalStock = variants
      .filter((v: { stockQuantity: number; isActive: boolean }) => v.isActive)
      .reduce(
        (sum: number, v: { stockQuantity: number; isActive: boolean }) =>
          sum + v.stockQuantity,
        0,
      );

    const productStock = await tx.product.findUnique({
      where: { productId },
      select: { stockQuantity: true },
    });

    const combinedStock = totalStock + (productStock?.stockQuantity || 0);

    if (combinedStock === 0) {
      await tx.product.update({
        where: { productId },
        data: { status: ProductStatus.SOLD_OUT },
      });
    }
  }

  static async countActiveApplications(productId: string, variantId?: string) {
    const where: any = {
      productId,
      status: {
        in: ["PENDING", "APPROVED"],
      },
    };

    if (variantId) {
      where.variantId = variantId;
    }

    return prisma.kycApplication.count({ where });
  }
}
