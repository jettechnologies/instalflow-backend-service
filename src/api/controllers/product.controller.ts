import type { Request, Response } from "express";
import { ProductService } from "@/core/services/product.service";
import {
  CreateProductSchema,
  UpdateProductSchema,
  SearchQuerySchema,
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
    const companyId = req.user?.companyId;
    const { page, limit, sortOrder, category } = req.query;

    const products = await ProductService.getAllProducts({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
      category: category as string | undefined,
      companyId,
    });

    return ApiResponse.success(res, 200, "Products retrieved successfully", products);
  }

  static async getProductsCursor(req: Request, res: Response) {
    const companyId = req.user?.companyId;
    const { limit, cursor, sortOrder, category } = req.query;

    const products = await ProductService.getAllProductCursor({
      limit: limit ? Number(limit) : undefined,
      cursor: cursor as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
      category: category as string | undefined,
      companyId,
    });

    return ApiResponse.success(res, 200, "Products retrieved successfully", products);
  }

  static async searchProducts(req: Request, res: Response) {
    const { search, page, limit, minPrice, maxPrice } = req.query;

    const parsed = SearchQuerySchema.parse({
      search,
      page,
      limit,
      minPrice,
      maxPrice,
    });

    const result = await ProductService.searchProducts(parsed);

    return ApiResponse.success(res, 200, "Search completed successfully", result);
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

