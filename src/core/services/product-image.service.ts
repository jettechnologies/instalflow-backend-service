import { prisma } from "@/infrastructure/prisma";
import { NotFoundError, BadRequestError } from "@/shared/utils/AppError";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  type CloudinaryUploadResult,
} from "@/core/services/cloudinary.service";
import type { UpdateImageMetaInput } from "@/shared/schemas/product.schema";

async function resolveProductId(productId: string): Promise<bigint> {
  const product = await prisma.product.findUnique({
    where: { productId },
    select: { id: true },
  });

  if (!product) throw new NotFoundError("Product not found");

  return product.id;
}

export class ProductImageService {
  static async uploadGalleryImages(
    productId: string,
    files: Express.Multer.File[],
    altTextMap?: Record<number, string>,
  ) {
    if (!files.length) throw new BadRequestError("No image files provided");

    const productBigIntId = await resolveProductId(productId);

    const lastImage = await prisma.productImage.findFirst({
      where: { productId: productBigIntId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const sortOffset = (lastImage?.sortOrder ?? -1) + 1;

    const hasPrimary = await prisma.productImage.count({
      where: { productId: productBigIntId, isPrimary: true },
    });

    const uploadedAssets: CloudinaryUploadResult[] = [];

    try {
      for (const file of files) {
        const result = await uploadToCloudinary(file.path, "products");
        uploadedAssets.push(result);
      }
    } catch (uploadError) {
      await Promise.allSettled(
        uploadedAssets.map((a) => deleteFromCloudinary(a.public_id)),
      );
      throw uploadError;
    }

    const rows = uploadedAssets.map((asset, idx) => ({
      productId: productBigIntId,
      imageUrl: asset.url,
      cloudinaryPublicId: asset.public_id,
      altText: altTextMap?.[idx] ?? null,
      isPrimary: hasPrimary === 0 && idx === 0,
      sortOrder: sortOffset + idx,
    }));

    try {
      await prisma.productImage.createMany({ data: rows });
    } catch (dbError) {
      await Promise.allSettled(
        uploadedAssets.map((a) => deleteFromCloudinary(a.public_id)),
      );
      throw dbError;
    }

    return prisma.productImage.findMany({
      where: {
        productId: productBigIntId,
        cloudinaryPublicId: { in: uploadedAssets.map((a) => a.public_id) },
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  static async removeGalleryImage(productId: string, imageId: string) {
    const productBigIntId = await resolveProductId(productId);

    const image = await prisma.productImage.findFirst({
      where: { imageId, productId: productBigIntId },
      include: { variants: { select: { id: true } } },
    });

    if (!image) throw new NotFoundError("Image not found for this product");

    const { id: imageBigIntId, cloudinaryPublicId, isPrimary } = image;

    await prisma.$transaction(async (tx) => {
      if (image.variants.length > 0) {
        await tx.productVariantImage.deleteMany({
          where: { imageId: imageBigIntId },
        });
      }

      await tx.productImage.delete({ where: { imageId } });

      if (isPrimary) {
        const next = await tx.productImage.findFirst({
          where: { productId: productBigIntId },
          orderBy: { sortOrder: "asc" },
          select: { imageId: true },
        });

        if (next) {
          await tx.productImage.update({
            where: { imageId: next.imageId },
            data: { isPrimary: true },
          });
        }
      }
    });

    if (cloudinaryPublicId) {
      await deleteFromCloudinary(cloudinaryPublicId);
    }

    return { deleted: true, imageId };
  }

  static async reorderGalleryImages(productId: string, orderedIds: string[]) {
    const productBigIntId = await resolveProductId(productId);

    const existing = await prisma.productImage.findMany({
      where: { productId: productBigIntId },
      select: { imageId: true },
    });

    const existingSet = new Set(existing.map((i) => i.imageId));
    const invalid = orderedIds.filter((id) => !existingSet.has(id));

    if (invalid.length) {
      throw new BadRequestError(
        `Image IDs not found for this product: ${invalid.join(", ")}`,
      );
    }

    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.productImage.update({
          where: { imageId: id },
          data: { sortOrder: idx },
        }),
      ),
    );

    return prisma.productImage.findMany({
      where: { productId: productBigIntId },
      orderBy: { sortOrder: "asc" },
    });
  }

  static async setPrimaryImage(productId: string, imageId: string) {
    const productBigIntId = await resolveProductId(productId);

    const image = await prisma.productImage.findFirst({
      where: { imageId, productId: productBigIntId },
    });

    if (!image) throw new NotFoundError("Image not found for this product");

    await prisma.$transaction([
      prisma.productImage.updateMany({
        where: { productId: productBigIntId, isPrimary: true },
        data: { isPrimary: false },
      }),
      prisma.productImage.update({
        where: { imageId },
        data: { isPrimary: true },
      }),
    ]);

    return prisma.productImage.findMany({
      where: { productId: productBigIntId },
      orderBy: { sortOrder: "asc" },
    });
  }

  static async updateImageMeta(
    productId: string,
    imageId: string,
    meta: UpdateImageMetaInput,
  ) {
    const productBigIntId = await resolveProductId(productId);

    const image = await prisma.productImage.findFirst({
      where: { imageId, productId: productBigIntId },
    });

    if (!image) throw new NotFoundError("Image not found for this product");

    return prisma.productImage.update({
      where: { imageId },
      data: {
        ...(meta.altText !== undefined && { altText: meta.altText }),
        ...(meta.sortOrder !== undefined && { sortOrder: meta.sortOrder }),
      },
    });
  }

  static async getGallery(productId: string) {
    const productBigIntId = await resolveProductId(productId);

    return prisma.productImage.findMany({
      where: { productId: productBigIntId },
      orderBy: { sortOrder: "asc" },
      include: {
        variants: {
          select: {
            id: true,
            variant: { select: { variantId: true, sku: true } },
          },
        },
      },
    });
  }

  static async setVariantImages(variantId: string, imageIds: string[]) {
    const variant = await prisma.productVariant.findUnique({
      where: { variantId },
      select: { id: true, productId: true },
    });

    if (!variant) throw new NotFoundError("Variant not found");

    let validImages: { id: bigint }[] = [];

    if (imageIds.length > 0) {
      const productBigIntId = await resolveProductId(variant.productId);

      validImages = await prisma.productImage.findMany({
        where: { imageId: { in: imageIds }, productId: productBigIntId },
        select: { id: true },
      });

      if (validImages.length !== imageIds.length) {
        const validSet = new Set(validImages.map((i) => i.id.toString()));
        const foreignIds = imageIds.filter(
          (id) => !validSet.has(id.toString()),
        );
        throw new BadRequestError(
          `These image IDs do not belong to this product: ${foreignIds.join(", ")}`,
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.productVariantImage.deleteMany({
        where: { variantId: variant.id },
      });

      if (validImages.length > 0) {
        await tx.productVariantImage.createMany({
          data: validImages.map((img, idx) => ({
            variantId: variant.id,
            imageId: img.id,
            isPrimary: idx === 0,
            sortOrder: idx,
          })),
          skipDuplicates: true,
        });
      }
    });

    return prisma.productVariant.findUnique({
      where: { variantId },
      include: {
        images: {
          orderBy: { sortOrder: "asc" },
          include: { image: true },
        },
      },
    });
  }
}
