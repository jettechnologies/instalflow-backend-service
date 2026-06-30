import type { Request, Response } from "express";
import { VariantService } from "@/core/services/variant.service";
import {
  UpdateVariantStockSchema,
  DeactivateVariantSchema,
  CreateVariantSchema,
} from "@/shared/schemas/variant.schema";
import ApiResponse from "@/shared/utils/ApiResponse";

export class VariantController {
  static async getVariantsByProduct(req: Request, res: Response) {
    const productId = req.params.productId as string;
    const variants = await VariantService.getVariantsByProduct(productId);
    return ApiResponse.success(res, 200, "Variants retrieved successfully", variants);
  }

  static async updateVariantStock(req: Request, res: Response) {
    const variantId = req.params.variantId as string;
    const payload = UpdateVariantStockSchema.parse(req.body);
    const variant = await VariantService.updateVariantStock(variantId, payload);
    return ApiResponse.success(res, 200, "Variant stock updated successfully", variant);
  }

  static async deactivateVariant(req: Request, res: Response) {
    const variantId = req.params.variantId as string;
    const payload = DeactivateVariantSchema.parse(req.body);
    const variant = await VariantService.deactivateVariant(variantId, payload);
    return ApiResponse.success(res, 200, "Variant status updated successfully", variant);
  }

  static async createVariant(req: Request, res: Response) {
    const productId = req.params.productId as string;
    const payload = CreateVariantSchema.parse({
      ...req.body,
      productId,
      price: Number(req.body.price),
      stockQuantity: Number(req.body.stockQuantity) || 0,
    });
    const variant = await VariantService.addVariant(payload);
    return ApiResponse.success(res, 201, "Variant created successfully", variant);
  }

  static async updateVariant(req: Request, res: Response) {
    const variantId = req.params.variantId as string;
    const payload = CreateVariantSchema.partial().parse({
      ...req.body,
      ...(req.body.price !== undefined && { price: Number(req.body.price) }),
      ...(req.body.stockQuantity !== undefined && { stockQuantity: Number(req.body.stockQuantity) }),
    });
    const variant = await VariantService.updateVariant(variantId, payload);
    return ApiResponse.success(res, 200, "Variant updated successfully", variant);
  }
}