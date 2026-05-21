import { prisma } from "@/infrastructure/prisma";
import { z } from "zod";
import {
  CreateProductSchema,
  UpdateProductSchema,
  SearchQueryType,
  ProductQueryParams,
  ProductCursorQueryParams,
} from "@/shared/schemas/product.schema";
import { NotFoundError } from "@/shared/utils/AppError";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "@/core/services/cloudinary.service";
import fs from "fs";

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
  // static async createProduct(
  //   companyId: string | undefined,
  //   data: z.infer<typeof CreateProductSchema>
  // ) {
  //   const slug = this.generateSlug(data.name);

  //   // Process and upload images to Cloudinary if needed
  //   const processedImages = await this.processImages(data.images || []);

  //   return prisma.product.create({
  //     data: {
  //       name: data.name,
  //       slug,
  //       description: data.description,
  //       price: data.price,
  //       minPrice: data.minPrice,
  //       maxPrice: data.maxPrice,
  //       stockQuantity: data.stockQuantity,
  //       commissionRate: data.commissionRate,
  //       companyId: companyId,
  //       categoryId: data.categoryId,
  //       variants: {
  //         create: data.variants?.map((v) => ({
  //           sku: v.sku,
  //           size: v.size,
  //           color: v.color,
  //           images: v.images,
  //           stockQuantity: v.stockQuantity,
  //           price: v.price,
  //         })),
  //       },
  //       installmentPlans: {
  //         create: data.installmentPlans?.map((p) => ({
  //           durationMonths: p.durationMonths,
  //           interestPercentage: p.interestPercentage,
  //           active: p.active ?? true,
  //         })),
  //       },
  //       images: {
  //         create: processedImages,
  //       },
  //     },
  //     include: {
  //       variants: true,
  //       installmentPlans: true,
  //       images: true,
  //     },
  //   });
  // }

  static async createProduct(
    companyId: string | undefined,
    data: z.infer<typeof CreateProductSchema>,
    files?: Express.Multer.File[],
  ) {
    const slug = this.generateSlug(data.name);

    let processedImages: any[] = [];

    if (files && files.length > 0) {
      // Map multer files into the shape processImages expects, then let it handle Cloudinary upload
      const fileImages = files.map((file, idx) => ({
        imageUrl: file.path, // local disk path — processImages detects isLocalFile
        altText: data.name,
        isPrimary: idx === 0,
        sortOrder: idx,
        cloudinaryPublicId: null,
      }));
      processedImages = await this.processImages(fileImages);
    } else if (data.images && data.images.length > 0) {
      processedImages = await this.processImages(data.images);
    }

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
        companyId,
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
        images: {
          create: processedImages,
        },
      },
      include: { variants: true, installmentPlans: true, images: true },
    });
  }

  static async updateProduct(
    productId: string,
    data: z.infer<typeof UpdateProductSchema>,
    files?: Express.Multer.File[],
  ) {
    const product = await prisma.product.findUnique({
      where: { productId },
      include: { images: true },
    });
    if (!product) throw new NotFoundError("Product not found");

    let processedImages: any[] | undefined = undefined;
    const hasNewFiles = files && files.length > 0;
    const hasNewUrls = data.images && data.images.length > 0;

    if (hasNewFiles || hasNewUrls) {
      // Delete old Cloudinary assets and DB records for either path
      for (const oldImg of product.images) {
        if (oldImg.cloudinaryPublicId) {
          await deleteFromCloudinary(oldImg.cloudinaryPublicId);
        }
      }
      await prisma.productImage.deleteMany({
        where: { productId: product.id },
      });

      if (hasNewFiles) {
        const fileImages = files!.map((file, idx) => ({
          imageUrl: file.path, // local disk path — processImages detects isLocalFile
          altText: data.name ?? product.name,
          isPrimary: idx === 0,
          sortOrder: idx,
          cloudinaryPublicId: null,
        }));
        processedImages = await this.processImages(fileImages);
      } else {
        processedImages = await this.processImages(data.images!);
      }
    }

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
        isActive: data.active,
        images: processedImages ? { create: processedImages } : undefined,
      },
      include: { variants: true, installmentPlans: true, images: true },
    });
  }

  /**
   * Get all products with offset-based pagination and optional category/company filters.
   */
  static async getAllProducts(params: ProductQueryParams) {
    const {
      page = 1,
      limit = 10,
      sortOrder = "desc",
      category,
      companyId,
    } = params;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      isActive: true,
    };

    if (companyId) {
      whereClause.companyId = companyId;
    }

    if (category) {
      whereClause.category = {
        OR: [
          { name: { equals: category, mode: "insensitive" } },
          { slug: { equals: category, mode: "insensitive" } },
        ],
      };
    }

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
        include: {
          images: true,
          category: true,
          variants: true,
          installmentPlans: {
            where: { active: true },
            orderBy: { durationMonths: "asc" },
          },
        },
      }),
      prisma.product.count({ where: whereClause }),
    ]);

    const productsWithBreakdowns = products.map((product) =>
      this.attachBreakdowns(product),
    );
    const totalPages = Math.ceil(total / limit);

    const pagination = {
      total,
      totalPages,
      currentPage: page,
      limit,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };

    return { products: productsWithBreakdowns, pagination };
  }

  /**
   * Get all products with cursor-based pagination and optional category/company filters.
   */
  static async getAllProductCursor(params: ProductCursorQueryParams) {
    const {
      limit = 10,
      cursor,
      sortOrder = "desc",
      category,
      companyId,
    } = params;

    const whereClause: any = {
      isActive: true,
    };

    if (companyId) {
      whereClause.companyId = companyId;
    }

    if (category) {
      whereClause.category = {
        OR: [
          { name: { equals: category, mode: "insensitive" } },
          { slug: { equals: category, mode: "insensitive" } },
        ],
      };
    }

    if (cursor) {
      if (sortOrder === "desc") {
        whereClause.id = { lte: BigInt(cursor) };
      } else {
        whereClause.id = { gte: BigInt(cursor) };
      }
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      take: limit + 1,
      orderBy: { id: sortOrder },
      include: {
        images: true,
        category: true,
        variants: true,
        installmentPlans: {
          where: { active: true },
          orderBy: { durationMonths: "asc" },
        },
      },
    });

    const productsWithBreakdowns = products.map((product) =>
      this.attachBreakdowns(product),
    );

    let nextCursor: string | null = null;
    if (productsWithBreakdowns.length > limit) {
      const nextItem = productsWithBreakdowns.pop();
      nextCursor = nextItem ? nextItem.id.toString() : null;
    }

    const prevCursor = productsWithBreakdowns.length
      ? productsWithBreakdowns[0].id.toString()
      : null;

    const pagination = {
      limit,
      nextCursor,
      prevCursor,
      hasNextPage: !!nextCursor,
      hasPreviousPage: !!cursor,
      nextLink: nextCursor
        ? `/products/cursor?cursor=${nextCursor}&limit=${limit}${category ? `&category=${encodeURIComponent(category)}` : ""}`
        : null,
      prevLink: prevCursor
        ? `/products/cursor?cursor=${prevCursor}&limit=${limit}${category ? `&category=${encodeURIComponent(category)}` : ""}`
        : null,
    };

    return { products: productsWithBreakdowns, pagination };
  }

  /**
   * Perfected Full-Text Search using PostgreSQL GIN indexes and plainto_tsquery, combined with Prisma relations.
   */
  static async searchProducts(params: SearchQueryType) {
    const { search: q, page = 1, limit = 10, minPrice, maxPrice } = params;
    const offset = (page - 1) * limit;

    // 1. Run raw query to search by vector and get matched IDs & ranks
    const matchResults = await prisma.$queryRaw<any[]>`
      SELECT 
        p.id,
        ts_rank(p.search_vector, plainto_tsquery('english', ${q})) AS rank
      FROM "Product" p
      WHERE 
        p.is_active = true
        AND p.search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // 2. Count total matches
    const totalResult = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS total
      FROM "Product" p
      WHERE 
        p.is_active = true
        AND p.search_vector @@ plainto_tsquery('english', ${q})
    `;

    const total = totalResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    if (matchResults.length === 0) {
      return {
        products: [],
        pagination: {
          total,
          totalPages,
          currentPage: page,
          limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    }

    const matchedIds = matchResults.map((r) => r.id);

    // 3. Query complete products from database using matched IDs
    const products = await prisma.product.findMany({
      where: {
        id: { in: matchedIds },
        // Apply price filters in prisma if supplied
        ...(minPrice !== undefined ? { price: { gte: minPrice } } : {}),
        ...(maxPrice !== undefined ? { price: { lte: maxPrice } } : {}),
      },
      include: {
        images: true,
        category: true,
        variants: true,
        installmentPlans: {
          where: { active: true },
          orderBy: { durationMonths: "asc" },
        },
      },
    });

    // 4. Map back to products and attach breakdowns, then sort by rank matching order of matchResults
    const productsWithBreakdowns = products.map((p) =>
      this.attachBreakdowns(p),
    );

    // Sort products by the rank order returned by matchedIds
    const matchedIdMap = new Map(
      matchedIds.map((id, index) => [id.toString(), index]),
    );
    productsWithBreakdowns.sort((a, b) => {
      const indexA = matchedIdMap.get(a.id.toString()) ?? 999;
      const indexB = matchedIdMap.get(b.id.toString()) ?? 999;
      return indexA - indexB;
    });

    return {
      products: productsWithBreakdowns,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
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
        images: true,
      },
    });

    if (!product) throw new NotFoundError("Product not found");

    return this.attachBreakdowns(product);
  }

  /**
   * Update a product (Note: Does not perform full nested sync for simplicity. Usually better to delete/recreate variants).
   */
  // static async updateProduct(
  //   productId: string,
  //   data: z.infer<typeof UpdateProductSchema>,
  // ) {
  //   const product = await prisma.product.findUnique({
  //     where: { productId },
  //     include: { images: true },
  //   });
  //   if (!product) throw new NotFoundError("Product not found");

  //   let processedImages: any[] | undefined = undefined;
  //   if (data.images) {
  //     // 1. Delete old images from Cloudinary
  //     for (const oldImg of product.images) {
  //       if (oldImg.cloudinaryPublicId) {
  //         await deleteFromCloudinary(oldImg.cloudinaryPublicId);
  //       }
  //     }

  //     // 2. Remove old images from DB
  //     await prisma.productImage.deleteMany({
  //       where: { productId: product.id },
  //     });

  //     // 3. Process new images
  //     processedImages = await this.processImages(data.images);
  //   }

  //   return prisma.product.update({
  //     where: { productId },
  //     data: {
  //       name: data.name,
  //       description: data.description,
  //       price: data.price,
  //       minPrice: data.minPrice,
  //       maxPrice: data.maxPrice,
  //       stockQuantity: data.stockQuantity,
  //       commissionRate: data.commissionRate,
  //       categoryId: data.categoryId,
  //       isActive: data.active,
  //       images: processedImages
  //         ? {
  //             create: processedImages,
  //           }
  //         : undefined,
  //     },
  //     include: {
  //       variants: true,
  //       installmentPlans: true,
  //       images: true,
  //     },
  //   });
  // }

  /**
   * Soft delete a product.
   */
  static async deleteProduct(productId: string) {
    return prisma.product.update({
      where: { productId },
      data: { isActive: false },
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

  /**
   * Helper to process and upload raw/base64/local image files to Cloudinary.
   */
  private static async processImages(images: any[]): Promise<any[]> {
    if (!images || images.length === 0) return [];

    const processed = [];
    for (const img of images) {
      let imageUrl = img.imageUrl;
      let cloudinaryPublicId = img.cloudinaryPublicId;

      const isBase64 =
        imageUrl.startsWith("data:image/") ||
        imageUrl.startsWith("data:application/");
      const isLocalFile =
        !imageUrl.startsWith("http://") &&
        !imageUrl.startsWith("https://") &&
        fs.existsSync(imageUrl);

      if (isBase64 || isLocalFile) {
        try {
          const uploadResult = await uploadToCloudinary(imageUrl, "products");
          imageUrl = uploadResult.url;
          cloudinaryPublicId = uploadResult.public_id;
        } catch (error) {
          console.error(
            "Failed to upload image to Cloudinary during product image processing:",
            error,
          );
          throw error;
        }
      }

      processed.push({
        imageUrl,
        altText: img.altText || null,
        isPrimary: img.isPrimary ?? false,
        sortOrder: img.sortOrder ?? 0,
        cloudinaryPublicId: cloudinaryPublicId || null,
      });
    }

    return processed;
  }
}
