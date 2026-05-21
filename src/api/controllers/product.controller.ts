import type { Request, Response } from "express";
import { ProductService } from "@/core/services/product.service";
import {
  CreateProductSchema,
  UpdateProductSchema,
  SearchQuerySchema,
} from "@/shared/schemas/product.schema";
import ApiResponse from "@/shared/utils/ApiResponse";

export class ProductController {
  // static async createProduct(req: Request, res: Response) {
  //   const payload = CreateProductSchema.parse(req.body);

  //   const product = await ProductService.createProduct(
  //     req.user!.companyId,
  //     payload
  //   );

  //   return ApiResponse.success(res, 201, "Product created successfully", product);
  // }

  static async createProduct(req: Request, res: Response) {
    const body = req.body;
    const files: Express.Multer.File[] = (req.files ??
      []) as Express.Multer.File[];

    const transformedData = {
      ...body,
      price: body.price ? Number(body.price) : undefined,
      minPrice: body.minPrice ? Number(body.minPrice) : undefined,
      maxPrice: body.maxPrice ? Number(body.maxPrice) : undefined,
      stockQuantity: body.stockQuantity
        ? Number(body.stockQuantity)
        : undefined,
      commissionRate: body.commissionRate
        ? Number(body.commissionRate)
        : undefined,
      variants:
        typeof body.variants === "string"
          ? JSON.parse(body.variants)
          : body.variants,
      installmentPlans:
        typeof body.installmentPlans === "string"
          ? JSON.parse(body.installmentPlans)
          : body.installmentPlans,
    };

    const payload = CreateProductSchema.parse(transformedData);
    const product = await ProductService.createProduct(
      req.user!.companyId,
      payload,
      files,
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
    const body = req.body;
    const files: Express.Multer.File[] = (req.files ??
      []) as Express.Multer.File[];

    const transformedData = {
      name: body.name || undefined,
      description: body.description || undefined,
      price:
        body.price === ""
          ? undefined
          : body.price
            ? Number(body.price)
            : undefined,
      minPrice:
        body.minPrice === ""
          ? undefined
          : body.minPrice
            ? Number(body.minPrice)
            : undefined,
      maxPrice:
        body.maxPrice === ""
          ? undefined
          : body.maxPrice
            ? Number(body.maxPrice)
            : undefined,
      stockQuantity:
        body.stockQuantity === ""
          ? undefined
          : body.stockQuantity
            ? Number(body.stockQuantity)
            : undefined,
      commissionRate:
        body.commissionRate === ""
          ? undefined
          : body.commissionRate
            ? Number(body.commissionRate)
            : undefined,
      categoryId: body.categoryId || undefined,
      active:
        body.active !== undefined
          ? body.active === "true" || body.active === true
          : undefined,
      variants: body.variants
        ? typeof body.variants === "string"
          ? JSON.parse(body.variants)
          : body.variants
        : undefined,
      installmentPlans: body.installmentPlans
        ? typeof body.installmentPlans === "string"
          ? JSON.parse(body.installmentPlans)
          : body.installmentPlans
        : undefined,
    };

    const payload = UpdateProductSchema.parse(transformedData);
    const product = await ProductService.updateProduct(
      productId,
      payload,
      files,
    );

    return ApiResponse.success(
      res,
      200,
      "Product updated successfully",
      product,
    );
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

    return ApiResponse.success(
      res,
      200,
      "Products retrieved successfully",
      products,
    );
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

    return ApiResponse.success(
      res,
      200,
      "Products retrieved successfully",
      products,
    );
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

    return ApiResponse.success(
      res,
      200,
      "Search completed successfully",
      result,
    );
  }

  static async getProductById(req: Request, res: Response) {
    const productId = req.params.id as string;
    const product = await ProductService.getProductById(productId);

    return ApiResponse.success(
      res,
      200,
      "Product retrieved successfully",
      product,
    );
  }

  // static async updateProduct(req: Request, res: Response) {
  //   const productId = req.params.id as string;
  //   const payload = UpdateProductSchema.parse(req.body);

  //   const product = await ProductService.updateProduct(productId, payload);

  //   return ApiResponse.success(res, 200, "Product updated successfully", product);
  // }

  static async deleteProduct(req: Request, res: Response) {
    const productId = req.params.id as string;

    await ProductService.deleteProduct(productId);

    return ApiResponse.success(res, 200, "Product deleted successfully");
  }
}
