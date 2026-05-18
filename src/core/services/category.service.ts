import { prisma } from "@/infrastructure/prisma";
import { z } from "zod";
import { CreateCategorySchema, UpdateCategorySchema } from "@/shared/schemas/category.schema";
import { NotFoundError, BadRequestError } from "@/shared/utils/AppError";

export class CategoryService {
  private static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }

  static async createCategory(data: z.infer<typeof CreateCategorySchema>) {
    const slug = this.generateSlug(data.name);

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestError("Category with a similar name/slug already exists");
    }

    return prisma.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
      },
    });
  }

  static async getCategories() {
    return prisma.category.findMany({
      orderBy: { name: "asc" },
    });
  }

  static async getCategoryById(categoryId: string) {
    const category = await prisma.category.findUnique({
      where: { categoryId },
    });
    if (!category) throw new NotFoundError("Category not found");
    return category;
  }

  static async updateCategory(categoryId: string, data: z.infer<typeof UpdateCategorySchema>) {
    const category = await prisma.category.findUnique({ where: { categoryId } });
    if (!category) throw new NotFoundError("Category not found");

    let slug = category.slug;
    if (data.name && data.name !== category.name) {
      slug = this.generateSlug(data.name);
      const existing = await prisma.category.findUnique({ where: { slug } });
      if (existing && existing.categoryId !== categoryId) {
        throw new BadRequestError("Category with a similar name/slug already exists");
      }
    }

    return prisma.category.update({
      where: { categoryId },
      data: {
        name: data.name,
        slug,
        description: data.description,
      },
    });
  }

  static async deleteCategory(categoryId: string) {
    const category = await prisma.category.findUnique({
      where: { categoryId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundError("Category not found");

    if (category._count.products > 0) {
      throw new BadRequestError("Cannot delete category containing active products");
    }

    return prisma.category.delete({
      where: { categoryId },
    });
  }
}
