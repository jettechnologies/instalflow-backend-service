import type { Request, Response } from "express";
import { ProductService } from "@/core/services/product.service";
import ApiResponse from "@/shared/utils/ApiResponse";
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductQueryParams,
  ProductCursorQueryParams,
  SearchQuerySchema,
  BulkProductsSchema,
} from "@/shared/schemas/product.schema";

export class ProductController {
  static async createProduct(req: Request, res: Response) {
    const payload = CreateProductSchema.parse({
      ...req.body,
      companyId: req.user?.companyId,
    });

    const product = await ProductService.createProduct(
      req.user?.companyId,
      payload,
    );

    return ApiResponse.success(
      res,
      201,
      "Product created successfully",
      product,
    );
  }

  static async updateProduct(req: Request, res: Response) {
    const productId = req.params.id as string;

    const payload = UpdateProductSchema.parse(req.body);

    const product = await ProductService.updateProduct(productId, payload);

    return ApiResponse.success(
      res,
      200,
      "Product updated successfully",
      product,
    );
  }

  static async getProducts(req: Request, res: Response) {
    const params = ProductQueryParams.parse({
      ...req.query,
      companyId: req.user?.companyId,
    });

    const products = await ProductService.getAllProducts(params);

    return ApiResponse.success(
      res,
      200,
      "Products retrieved successfully",
      products,
    );
  }

  static async getProductsCursor(req: Request, res: Response) {
    const params = ProductCursorQueryParams.parse({
      ...req.query,
      companyId: req.user?.companyId,
    });

    const products = await ProductService.getAllProductCursor(params);

    return ApiResponse.success(
      res,
      200,
      "Products retrieved successfully",
      products,
    );
  }

  static async searchProducts(req: Request, res: Response) {
    const payload = SearchQuerySchema.parse(req.query);

    const result = await ProductService.searchProducts(payload);

    return ApiResponse.success(
      res,
      200,
      "Search completed successfully",
      result,
    );
  }

  static async getProductById(req: Request, res: Response) {
    const product = await ProductService.getProductById(
      req.params.id as string,
    );

    return ApiResponse.success(
      res,
      200,
      "Product retrieved successfully",
      product,
    );
  }

  static async deleteProduct(req: Request, res: Response) {
    await ProductService.deleteProduct(req.params.id as string);

    return ApiResponse.success(res, 200, "Product archived successfully");
  }

  static async createProductsBulk(req: Request, res: Response) {
    const companyId = req.user?.companyId as string;
    const body = Array.isArray(req.body) ? req.body : req.body.products;

    const payload = BulkProductsSchema.parse(body);

    const result = await ProductService.createProductsBulk(companyId, payload);

    return ApiResponse.success(
      res,
      201,
      `${result.count} products created successfully`,
      result,
    );
  }
}
