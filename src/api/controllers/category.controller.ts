import type { Request, Response } from "express";
import { CategoryService } from "@/core/services/category.service";
import { CreateCategorySchema, UpdateCategorySchema } from "@/shared/schemas/category.schema";
import ApiResponse from "@/shared/utils/ApiResponse";

export class CategoryController {
  static async createCategory(req: Request, res: Response) {
    const payload = CreateCategorySchema.parse(req.body);
    const category = await CategoryService.createCategory(payload);
    return ApiResponse.success(res, 201, "Category created successfully", category);
  }

  static async getCategories(req: Request, res: Response) {
    const categories = await CategoryService.getCategories();
    return ApiResponse.success(res, 200, "Categories retrieved successfully", categories);
  }

  static async getCategoryById(req: Request, res: Response) {
    const categoryId = req.params.id as string;
    const category = await CategoryService.getCategoryById(categoryId);
    return ApiResponse.success(res, 200, "Category retrieved successfully", category);
  }

  static async updateCategory(req: Request, res: Response) {
    const categoryId = req.params.id as string;
    const payload = UpdateCategorySchema.parse(req.body);
    const category = await CategoryService.updateCategory(categoryId, payload);
    return ApiResponse.success(res, 200, "Category updated successfully", category);
  }

  static async deleteCategory(req: Request, res: Response) {
    const categoryId = req.params.id as string;
    await CategoryService.deleteCategory(categoryId);
    return ApiResponse.success(res, 200, "Category deleted successfully");
  }
}
