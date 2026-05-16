import { prisma } from "@/infrastructure/prisma";
import { z } from "zod";
import {
  CreateProductSchema,
  UpdateProductSchema,
} from "@/shared/schemas/product.schema";
import { NotFoundError } from "@/shared/utils/AppError";

export class ProductService {
  /**
   * Generates a unique slug for the product.
   */
  private static generateSlug(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "") +
      "-" +
      Math.floor(Math.random() * 10000)
    );
  }

  /**
   * Create a new product with optional variants and installment plans.
   */
  static async createProduct(
    companyId: string | undefined,
    data: z.infer<typeof CreateProductSchema>
  ) {
    const slug = this.generateSlug(data.name);

    return prisma.product.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        price: data.price,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        stockQuantity: data.stockQuantity,
        commissionRate: data.commissionRate,
        companyId: companyId,
        categoryId: data.categoryId,
        variants: {
          create: data.variants?.map((v) => ({
            sku: v.sku,
            size: v.size,
            color: v.color,
            images: v.images,
            stockQuantity: v.stockQuantity,
            price: v.price,
          })),
        },
        installmentPlans: {
          create: data.installmentPlans?.map((p) => ({
            durationMonths: p.durationMonths,
            interestPercentage: p.interestPercentage,
            active: p.active ?? true,
          })),
        },
      },
      include: {
        variants: true,
        installmentPlans: true,
      },
    });
  }

  /**
   * Get all products with calculated installment breakdowns.
   */
  static async getProducts(companyId?: string) {
    const products = await prisma.product.findMany({
      where: companyId ? { companyId, active: true } : { active: true },
      include: {
        variants: true,
        installmentPlans: {
          where: { active: true },
          orderBy: { durationMonths: "asc" },
        },
        category: true,
      },
    });

    return products.map((product) => this.attachBreakdowns(product));
  }

  /**
   * Get a single product by ID.
   */
  static async getProductById(productId: string) {
    const product = await prisma.product.findUnique({
      where: { productId },
      include: {
        variants: true,
        installmentPlans: {
          where: { active: true },
          orderBy: { durationMonths: "asc" },
        },
        category: true,
      },
    });

    if (!product) throw new NotFoundError("Product not found");

    return this.attachBreakdowns(product);
  }

  /**
   * Update a product (Note: Does not perform full nested sync for simplicity. Usually better to delete/recreate variants).
   */
  static async updateProduct(
    productId: string,
    data: z.infer<typeof UpdateProductSchema>
  ) {
    const product = await prisma.product.findUnique({ where: { productId } });
    if (!product) throw new NotFoundError("Product not found");

    // We only update top-level fields for now. 
    // Managing nested variant/plan updates typically requires complex upsert logic or dedicated endpoints.
    return prisma.product.update({
      where: { productId },
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        stockQuantity: data.stockQuantity,
        commissionRate: data.commissionRate,
        categoryId: data.categoryId,
        active: data.active,
      },
      include: {
        variants: true,
        installmentPlans: true,
      },
    });
  }

  /**
   * Soft delete a product.
   */
  static async deleteProduct(productId: string) {
    return prisma.product.update({
      where: { productId },
      data: { active: false },
    });
  }

  /**
   * Helper method to attach breakdown calculations to a product.
   */
  private static attachBreakdowns(product: any) {
    const plans = product.installmentPlans || [];
    const variants = product.variants || [];

    // Calculate breakdowns
    const breakdowns: any[] = [];

    if (variants.length > 0) {
      // If variants exist, calculate breakdown per variant per plan
      variants.forEach((variant: any) => {
        const basePrice = Number(variant.price);
        plans.forEach((plan: any) => {
          const interestRate = Number(plan.interestPercentage) / 100;
          const totalPrice = basePrice * (1 + interestRate);
          const monthlyPayment = totalPrice / plan.durationMonths;

          breakdowns.push({
            variantId: variant.variantId,
            sku: variant.sku,
            planId: plan.planId,
            durationMonths: plan.durationMonths,
            interestPercentage: Number(plan.interestPercentage),
            basePrice: basePrice,
            totalPrice: Number(totalPrice.toFixed(2)),
            monthlyPayment: Number(monthlyPayment.toFixed(2)),
          });
        });
      });
    } else {
      // If no variants, use product base price
      const basePrice = Number(product.price);
      plans.forEach((plan: any) => {
        const interestRate = Number(plan.interestPercentage) / 100;
        const totalPrice = basePrice * (1 + interestRate);
        const monthlyPayment = totalPrice / plan.durationMonths;

        breakdowns.push({
          planId: plan.planId,
          durationMonths: plan.durationMonths,
          interestPercentage: Number(plan.interestPercentage),
          basePrice: basePrice,
          totalPrice: Number(totalPrice.toFixed(2)),
          monthlyPayment: Number(monthlyPayment.toFixed(2)),
        });
      });
    }

    return {
      ...product,
      installmentBreakdown: breakdowns,
    };
  }
}
