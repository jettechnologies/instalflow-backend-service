import type { Request, Response } from "express";
import { ProductService } from "@/core/services/product.service";
import {
  CreateProductSchema,
  UpdateProductSchema,
} from "@/shared/schemas/product.schema";
import ApiResponse from "@/shared/utils/ApiResponse";

export class ProductController {
  static async createProduct(req: Request, res: Response) {
    const payload = CreateProductSchema.parse(req.body);

    const product = await ProductService.createProduct(
      req.user!.companyId,
      payload
    );

    return ApiResponse.success(res, 201, "Product created successfully", product);
  }

  static async getProducts(req: Request, res: Response) {
    // If the user belongs to a company, filter by that company.
    // If SUPER_ADMIN, they might see all (though this would be a superadmin route ideally).
    // For now, we optionally pass companyId.
    const companyId = req.user?.companyId;

    const products = await ProductService.getProducts(companyId);

    return ApiResponse.success(res, 200, "Products retrieved successfully", products);
  }

  static async getProductById(req: Request, res: Response) {
    const productId = req.params.id as string;
    const product = await ProductService.getProductById(productId);

    return ApiResponse.success(res, 200, "Product retrieved successfully", product);
  }

  static async updateProduct(req: Request, res: Response) {
    const productId = req.params.id as string;
    const payload = UpdateProductSchema.parse(req.body);

    const product = await ProductService.updateProduct(productId, payload);

    return ApiResponse.success(res, 200, "Product updated successfully", product);
  }

  static async deleteProduct(req: Request, res: Response) {
    const productId = req.params.id as string;

    await ProductService.deleteProduct(productId);

    return ApiResponse.success(res, 200, "Product deleted successfully");
  }
}
