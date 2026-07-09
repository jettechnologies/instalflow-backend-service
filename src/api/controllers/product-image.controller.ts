import type { Request, Response } from "express";
import { ProductImageService } from "@/core/services/product-image.service";
import ApiResponse from "@/shared/utils/ApiResponse";
import {
  ReorderGallerySchema,
  UpdateImageMetaSchema,
} from "@/shared/schemas/product.schema";

export class ProductImageController {
  static async uploadGalleryImages(req: Request, res: Response) {
    const productId = req.params.productId as string;
    const files = (req.files ?? []) as Express.Multer.File[];

    if (!productId || productId === "") {
      return ApiResponse.badRequest(res, "Invalid product ID");
    }

    if (!files.length) {
      return ApiResponse.badRequest(res, "No image files provided");
    }

    const altTextMap =
      typeof req.body.altTextMap === "string"
        ? JSON.parse(req.body.altTextMap)
        : req.body.altTextMap;

    const images = await ProductImageService.uploadGalleryImages(
      productId,
      files,
      altTextMap,
    );

    return ApiResponse.success(
      res,
      201,
      "Gallery images uploaded successfully",
      images,
    );
  }

  static async getGallery(req: Request, res: Response) {
    const productId = req.params.productId as string;

    if (!productId || productId === "") {
      return ApiResponse.badRequest(res, "Invalid product ID");
    }

    const gallery = await ProductImageService.getGallery(productId);

    return ApiResponse.success(
      res,
      200,
      "Gallery retrieved successfully",
      gallery,
    );
  }

  static async reorderGalleryImages(req: Request, res: Response) {
    const productId = req.params.productId as string;

    if (!productId || productId === "") {
      return ApiResponse.badRequest(res, "Invalid product ID");
    }

    const { orderedIds } = ReorderGallerySchema.parse(req.body);

    const gallery = await ProductImageService.reorderGalleryImages(
      productId,
      orderedIds.map(BigInt),
    );

    return ApiResponse.success(
      res,
      200,
      "Gallery reordered successfully",
      gallery,
    );
  }

  static async setPrimaryImage(req: Request, res: Response) {
    const productId = req.params.productId as string;
    const imageId = BigInt(req.params.imageId as string);

    if (!productId || productId === "") {
      return ApiResponse.badRequest(res, "Invalid product ID");
    }

    if (isNaN(Number(imageId))) {
      return ApiResponse.badRequest(res, "Invalid image ID");
    }

    const gallery = await ProductImageService.setPrimaryImage(
      productId,
      imageId,
    );

    return ApiResponse.success(
      res,
      200,
      "Primary image updated successfully",
      gallery,
    );
  }

  static async updateImageMeta(req: Request, res: Response) {
    const productId = req.params.productId as string;
    const imageId = BigInt(req.params.imageId as string);

    const payload = UpdateImageMetaSchema.parse(req.body);

    if (!productId || productId === "") {
      return ApiResponse.badRequest(res, "Invalid product ID");
    }

    if (isNaN(Number(imageId))) {
      return ApiResponse.badRequest(res, "Invalid image ID");
    }

    const image = await ProductImageService.updateImageMeta(
      productId,
      imageId,
      payload,
    );

    return ApiResponse.success(
      res,
      200,
      "Image metadata updated successfully",
      image,
    );
  }

  static async removeGalleryImage(req: Request, res: Response) {
    const productId = req.params.productId as string;
    const imageId = BigInt(req.params.imageId as string);

    if (!productId || productId === "") {
      return ApiResponse.badRequest(res, "Invalid product ID");
    }

    if (isNaN(Number(imageId))) {
      return ApiResponse.badRequest(res, "Invalid image ID");
    }

    const result = await ProductImageService.removeGalleryImage(
      productId,
      imageId,
    );

    return ApiResponse.success(res, 200, "Image removed successfully", result);
  }

  static async setVariantImages(req: Request, res: Response) {
    const variantId = req.params.variantId as string;

    const imageIds = Array.isArray(req.body.imageIds)
      ? req.body.imageIds.map((id: string) => BigInt(id))
      : [];

    const variant = await ProductImageService.setVariantImages(
      variantId,
      imageIds,
    );

    return ApiResponse.success(
      res,
      200,
      "Variant images updated successfully",
      variant,
    );
  }
}
