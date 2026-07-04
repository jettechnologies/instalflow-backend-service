import type { Request, Response } from "express";
import {
  BulkCreateVariantsSchema,
  CreateVariantSchema,
  DeactivateVariantSchema,
  UpdateVariantSchema,
  UpdateVariantStockSchema,
} from "@/shared/schemas/variant.schema";
import ApiResponse from "@/shared/utils/ApiResponse";
import {
  parseBoolean,
  parseNumber,
  parseNumberArray,
  parseObject,
  parseStringArray,
} from "@/shared/utils/helpers/request-parser";
import { VariantService } from "@/core/services/variant.service";

export class VariantController {
  static async createVariant(req: Request, res: Response) {
    const productId = req.params.productId;

    const payload = CreateVariantSchema.parse({
      ...req.body,

      productId,

      price: parseNumber(req.body.price),

      stockQuantity: parseNumber(req.body.stockQuantity),

      color: parseStringArray(req.body.color),

      imageIds: parseNumberArray(req.body.imageIds),

      attributes: parseObject(req.body.attributes),

      isActive: parseBoolean(req.body.isActive),
    });

    const variant = await VariantService.addVariant(payload);

    return ApiResponse.success(
      res,
      201,
      "Variant created successfully",
      variant,
    );
  }

  static async updateVariant(req: Request, res: Response) {
    const variantId = req.params.variantId as string;

    if (!variantId || variantId === "") {
      return ApiResponse.badRequest(res, "Invalid variant ID");
    }

    const payload = UpdateVariantSchema.parse({
      ...req.body,
      ...(req.body.price !== undefined && {
        price: parseNumber(req.body.price),
      }),
      ...(req.body.stockQuantity !== undefined && {
        stockQuantity: parseNumber(req.body.stockQuantity),
      }),
      ...(req.body.color !== undefined && {
        color: parseStringArray(req.body.color),
      }),
      ...(req.body.imageIds !== undefined && {
        imageIds: parseNumberArray(req.body.imageIds),
      }),
      ...(req.body.attributes !== undefined && {
        attributes: parseObject(req.body.attributes),
      }),
      ...(req.body.isActive !== undefined && {
        isActive: parseBoolean(req.body.isActive),
      }),
    });

    const variant = await VariantService.updateVariant(variantId, payload);

    return ApiResponse.success(
      res,
      200,
      "Variant updated successfully",
      variant,
    );
  }

  static async updateVariantStock(req: Request, res: Response) {
    const variantId = req.params.variantId as string;

    if (!variantId || variantId === "") {
      return ApiResponse.badRequest(res, "Invalid variant ID");
    }

    const payload = UpdateVariantStockSchema.parse({
      stockQuantity: parseNumber(req.body.stockQuantity),
    });

    const variant = await VariantService.updateVariantStock(variantId, payload);

    return ApiResponse.success(
      res,
      200,
      "Variant stock updated successfully",
      variant,
    );
  }

  static async deactivateVariant(req: Request, res: Response) {
    const variantId = req.params.variantId as string;

    if (!variantId || variantId === "") {
      return ApiResponse.badRequest(res, "Invalid variant ID");
    }

    const payload = DeactivateVariantSchema.parse({
      isActive: parseBoolean(req.body.isActive),
    });

    const variant = await VariantService.deactivateVariant(variantId, payload);

    return ApiResponse.success(
      res,
      200,
      "Variant status updated successfully",
      variant,
    );
  }

  static async bulkCreateVariants(req: Request, res: Response) {
    const body = req.body;

    const payload = BulkCreateVariantsSchema.parse({
      productId: body.productId,
      variants: (body.variants ?? []).map((variant: any) => ({
        ...variant,
        price: parseNumber(variant.price),
        stockQuantity: parseNumber(variant.stockQuantity),
        color: parseStringArray(variant.color),
        imageIds: parseNumberArray(variant.imageIds),
        attributes: parseObject(variant.attributes),
        isActive: parseBoolean(variant.isActive),
      })),
    });

    const result = await VariantService.bulkCreateVariants(payload);

    return ApiResponse.success(
      res,
      201,
      `${result.count} variants created successfully`,
      result,
    );
  }
}
