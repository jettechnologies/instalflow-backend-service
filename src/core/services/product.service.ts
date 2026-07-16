import { prisma, ProductStatus, Prisma } from "@/infrastructure/prisma";
import { NotFoundError, BadRequestError } from "@/shared/utils/AppError";
import {
  type CreateProductInput,
  type UpdateProductInput,
  type ProductQueryParamsInput,
  type ProductCursorQueryParamsInput,
  type SearchQueryInput,
  type BulkCreateProductInput,
} from "@/shared/schemas/product.schema";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export class ProductService {
  private static generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  static async syncStats(
    productId: string,
    tx: TxClient = prisma,
  ): Promise<void> {
    const variants = await tx.productVariant.findMany({
      where: { productId, isActive: true },
      select: { price: true, stockQuantity: true },
    });

    if (variants.length === 0) return;

    const prices = variants.map((v) => Number(v.price));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const totalStock = variants.reduce((sum, v) => sum + v.stockQuantity, 0);

    await tx.product.update({
      where: { productId },
      data: {
        price: new Prisma.Decimal(minPrice),
        minPrice: new Prisma.Decimal(minPrice),
        maxPrice: new Prisma.Decimal(maxPrice),
        stockQuantity: totalStock,
        status:
          totalStock === 0 ? ProductStatus.SOLD_OUT : ProductStatus.PUBLISHED,
      },
    });
  }

  static async createProduct(
    companyId: string | undefined,
    data: CreateProductInput,
  ) {
    const slug = this.generateSlug(data.name);

    return prisma.product.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        price: new Prisma.Decimal(data.price),
        stockQuantity: data.stockQuantity,
        commissionRate: new Prisma.Decimal(data.commissionRate),
        status: data.status,
        companyId,
        categoryId: data.categoryId,
        installmentPlans: data.installmentPlans.length
          ? {
              create: data.installmentPlans.map((p) => ({
                durationMonths: p.durationMonths,
                interestPercentage: new Prisma.Decimal(p.interestPercentage),
                active: p.active ?? true,
              })),
            }
          : undefined,
      },
      include: this.standardIncludes(),
    });
  }

  static async updateProduct(productId: string, data: UpdateProductInput) {
    const product = await prisma.product.findUnique({
      where: { productId },
      include: {
        variants: { where: { isActive: true }, select: { variantId: true } },
      },
    });

    if (!product) throw new NotFoundError("Product not found");

    const hasActiveVariants = product.variants.length > 0;

    if (
      hasActiveVariants &&
      (data.price !== undefined || data.stockQuantity !== undefined)
    ) {
      throw new BadRequestError(
        "Price and stock are automatically derived from active variants. " +
          "Update individual variant prices and stock instead.",
      );
    }

    return prisma.product.update({
      where: { productId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.commissionRate !== undefined && {
          commissionRate: new Prisma.Decimal(data.commissionRate),
        }),
        ...(data.status !== undefined && { status: data.status }),
        ...(!hasActiveVariants &&
          data.price !== undefined && {
            price: new Prisma.Decimal(data.price),
          }),
        ...(!hasActiveVariants &&
          data.stockQuantity !== undefined && {
            stockQuantity: data.stockQuantity,
          }),
      },
      include: this.standardIncludes(),
    });
  }

  static async deleteProduct(productId: string) {
    const product = await prisma.product.findUnique({
      where: { productId },
      include: {
        kycApplications: {
          where: { status: { in: ["PENDING", "APPROVED"] } },
          select: { kycApplicationId: true },
        },
        financingContracts: {
          where: {
            status: { in: ["ACTIVE", "PENDING_ACTIVATION", "RESTRUCTURED"] },
          },
          select: { contractId: true },
        },
      },
    });

    if (!product) throw new NotFoundError("Product not found");

    return prisma.product.update({
      where: { productId },
      data: { status: ProductStatus.ARCHIVED },
    });
  }

  static async getAllProducts(params: ProductQueryParamsInput) {
    const {
      page = 1,
      limit = 10,
      sortOrder = "desc",
      category,
      companyId,
      status,
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      status: status ?? ProductStatus.PUBLISHED,
      ...(companyId && { companyId }),
      ...(category && {
        category: {
          OR: [
            { name: { equals: category, mode: "insensitive" } },
            { slug: { equals: category, mode: "insensitive" } },
          ],
        },
      }),
    };

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
        include: this.standardIncludes(),
      }),
      prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      products: products.map((p) => this.attachBreakdowns(p)),
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

  static async getAllProductCursor(params: ProductCursorQueryParamsInput) {
    const {
      limit = 10,
      cursor,
      sortOrder = "desc",
      category,
      companyId,
    } = params;

    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.PUBLISHED,
      ...(companyId && { companyId }),
      ...(category && {
        category: {
          OR: [
            { name: { equals: category, mode: "insensitive" } },
            { slug: { equals: category, mode: "insensitive" } },
          ],
        },
      }),
      ...(cursor && {
        id:
          sortOrder === "desc"
            ? { lte: BigInt(cursor) }
            : { gte: BigInt(cursor) },
      }),
    };

    const raw = await prisma.product.findMany({
      where,
      take: limit + 1,
      orderBy: { id: sortOrder },
      include: this.standardIncludes(),
    });

    const products = raw.map((p) => this.attachBreakdowns(p));

    let nextCursor: string | null = null;
    if (products.length > limit) {
      const next = products.pop()!;
      nextCursor = next.id.toString();
    }

    const prevCursor = products.length ? products[0].id.toString() : null;

    return {
      products,
      pagination: {
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
      },
    };
  }

  static async searchProducts(params: SearchQueryInput) {
    const { search: q, page = 1, limit = 10, minPrice, maxPrice } = params;
    const offset = (page - 1) * limit;

    const [matchResults, totalResult] = await Promise.all([
      prisma.$queryRaw<{ id: bigint; rank: number }[]>`
        SELECT p.id,
               ts_rank(p.search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM   "Product" p
        WHERE  p.status = 'PUBLISHED'
        AND    p.search_vector @@ plainto_tsquery('english', ${q})
        ORDER  BY rank DESC
        LIMIT  ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM   "Product" p
        WHERE  p.status = 'PUBLISHED'
        AND    p.search_vector @@ plainto_tsquery('english', ${q})
      `,
    ]);

    const total = totalResult[0]?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    if (!matchResults.length) {
      return {
        products: [],
        pagination: {
          total,
          totalPages,
          currentPage: page,
          limit,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    }

    const matchedIds = matchResults.map((r) => r.id);

    const raw = await prisma.product.findMany({
      where: {
        id: { in: matchedIds },
        ...(minPrice !== undefined && {
          price: { gte: new Prisma.Decimal(minPrice) },
        }),
        ...(maxPrice !== undefined && {
          price: { lte: new Prisma.Decimal(maxPrice) },
        }),
      },
      include: this.standardIncludes(),
    });

    const products = raw.map((p) => this.attachBreakdowns(p));
    const rankOrder = new Map(matchedIds.map((id, i) => [id.toString(), i]));

    products.sort(
      (a, b) =>
        (rankOrder.get(a.id.toString()) ?? 999) -
        (rankOrder.get(b.id.toString()) ?? 999),
    );

    return {
      products,
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

  static async getProductById(productId: string) {
    const product = await prisma.product.findUnique({
      where: { productId },
      include: this.standardIncludes(),
    });

    if (!product) throw new NotFoundError("Product not found");

    return this.attachBreakdowns(product);
  }

  static async getProductBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: {
        slug,
      },
      include: this.standardIncludes(),
    });

    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new Error("Product not found");
    }

    return this.attachBreakdowns(product);
  }

  private static standardIncludes() {
    return {
      category: true,
      images: {
        orderBy: { sortOrder: "asc" as const },
      },
      variants: {
        where: { isActive: true as const },
        orderBy: { createdAt: "asc" as const },
        include: {
          images: {
            orderBy: { sortOrder: "asc" as const },
            include: { image: true },
          },
        },
      },
      installmentPlans: {
        where: { active: true as const },
        orderBy: { durationMonths: "asc" as const },
      },
    } satisfies Prisma.ProductInclude;
  }

  private static attachBreakdowns(product: any) {
    const plans = product.installmentPlans ?? [];
    const variants = product.variants ?? [];
    const breakdowns: any[] = [];

    const computeBreakdown = (
      basePrice: number,
      plan: any,
      extra: object = {},
    ) => ({
      ...extra,
      planId: plan.planId,
      durationMonths: plan.durationMonths,
      interestPercentage: Number(plan.interestPercentage),
      basePrice,
      totalPrice: Number(
        (basePrice * (1 + Number(plan.interestPercentage) / 100)).toFixed(2),
      ),
      monthlyPayment: Number(
        (
          (basePrice * (1 + Number(plan.interestPercentage) / 100)) /
          plan.durationMonths
        ).toFixed(2),
      ),
    });

    if (variants.length > 0) {
      for (const v of variants) {
        for (const p of plans) {
          breakdowns.push(
            computeBreakdown(Number(v.price), p, {
              variantId: v.variantId,
              sku: v.sku,
            }),
          );
        }
      }
    } else {
      for (const p of plans) {
        breakdowns.push(computeBreakdown(Number(product.price), p));
      }
    }

    return { ...product, installmentBreakdown: breakdowns };
  }

  static async createProductsBulk(
    companyId: string | undefined,
    products: BulkCreateProductInput[],
  ) {
    if (!products.length) {
      throw new BadRequestError("At least one product is required");
    }

    if (products.length > 50) {
      throw new BadRequestError("Maximum 50 products per bulk import");
    }

    const payloadSkus = products.flatMap((p) => p.variants.map((v) => v.sku));

    const duplicatePayloadSkus = payloadSkus.filter(
      (sku, index) => payloadSkus.indexOf(sku) !== index,
    );

    if (duplicatePayloadSkus.length) {
      throw new BadRequestError(
        `Duplicate SKU(s) in import: ${[...new Set(duplicatePayloadSkus)].join(
          ", ",
        )}`,
      );
    }

    const existing = await prisma.productVariant.findMany({
      where: {
        sku: {
          in: payloadSkus,
        },
      },
      select: {
        sku: true,
      },
    });

    if (existing.length) {
      throw new BadRequestError(
        `Variant SKU(s) already exist: ${existing
          .map((s) => s.sku)
          .join(", ")}`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const createdProducts = [];

      for (const item of products) {
        const slug = await this.generateSlug(item.name);
        const product = await tx.product.create({
          data: {
            companyId,
            name: item.name,
            slug,
            description: item.description,
            categoryId: item.categoryId,
            commissionRate: new Prisma.Decimal(item.commissionRate),
            status: item.status,
            price: new Prisma.Decimal(item.price),
            stockQuantity: item.stockQuantity,
            installmentPlans: item.installmentPlans.length
              ? {
                  create: item.installmentPlans.map((plan) => ({
                    durationMonths: plan.durationMonths,
                    interestPercentage: new Prisma.Decimal(
                      plan.interestPercentage,
                    ),
                    active: plan.active,
                  })),
                }
              : undefined,
          },
        });

        if (item.variants.length) {
          for (const variant of item.variants) {
            await tx.productVariant.create({
              data: {
                productId: product.productId,
                sku: variant.sku,
                size: variant.size,
                color: variant.color,
                attributes: variant.attributes,
                stockQuantity: variant.stockQuantity,
                price: new Prisma.Decimal(variant.price),
                isActive: variant.isActive,
              },
            });
          }
          await this.syncStats(product.productId, tx);
        }
        createdProducts.push(product);
      }
      return {
        count: createdProducts.length,
        products: createdProducts,
      };
    });
  }

  // static async createProductsBulk(
  //   companyId: string | undefined,
  //   products: BulkCreateProductInput[],
  // ) {
  //   if (!products || products.length === 0) {
  //     throw new BadRequestError("At least one product is required");
  //   }

  //   if (products.length > 100) {
  //     throw new BadRequestError("Maximum 100 products per bulk import");
  //   }

  //   const skus = products.flatMap((p) =>
  //     p.variants?.map((v) => v.sku) ?? [],
  //   );

  //   const existingSkus = await prisma.productVariant.findMany({
  //     where: { sku: { in: skus } },
  //     select: { sku: true },
  //   });

  //   if (existingSkus.length > 0) {
  //     const taken = existingSkus.map((v) => v.sku).join(", ");
  //     throw new BadRequestError(`Variant SKU(s) already exist: ${taken}`);
  //   }

  //   return prisma.$transaction(async (tx) => {
  //     const createdProducts = [];

  //     for (const productData of products) {
  //       const slug = this.generateSlug(productData.name);

  //       const product = await tx.product.create({
  //         data: {
  //           name: productData.name,
  //           slug,
  //           description: productData.description,
  //           price: new Prisma.Decimal(productData.price),
  //           stockQuantity: productData.stockQuantity,
  //           commissionRate: new Prisma.Decimal(productData.commissionRate),
  //           status: productData.status,
  //           companyId,
  //           categoryId: productData.categoryId,
  //           installmentPlans: productData.installmentPlans?.length
  //             ? {
  //                 create: productData.installmentPlans.map((p) => ({
  //                   durationMonths: p.durationMonths,
  //                   interestPercentage: new Prisma.Decimal(
  //                     p.interestPercentage,
  //                   ),
  //                   active: p.active ?? true,
  //                 })),
  //               }
  //             : undefined,
  //         },
  //         include: this.standardIncludes(),
  //       });

  //       if (productData.variants?.length) {
  //         for (const variant of productData.variants) {
  //           const createdVariant = await tx.productVariant.create({
  //             data: {
  //               productId: product.productId,
  //               sku: variant.sku,
  //               size: variant.size,
  //               color: variant.color ?? [],
  //               ...(variant.attributes !== undefined && {
  //                 attributes: variant.attributes,
  //               }),
  //               stockQuantity: variant.stockQuantity ?? 0,
  //               price: new Prisma.Decimal(variant.price),
  //               isActive: variant.isActive ?? true,
  //             },
  //           });

  //           if (variant.imageIds?.length) {
  //             await tx.productVariantImage.createMany({
  //               data: variant.imageIds.map((imageId, idx) => ({
  //                 variantId: createdVariant.id,
  //                 imageId: BigInt(imageId),
  //                 isPrimary: idx === 0,
  //                 sortOrder: idx,
  //               })),
  //               skipDuplicates: true,
  //             });
  //           }
  //         }

  //         await ProductService.syncStats(product.productId, tx);
  //       }

  //       createdProducts.push(product);
  //     }

  //     return { count: createdProducts.length, products: createdProducts };
  //   });
  // }
}

// import { prisma, ProductStatus } from "@/infrastructure/prisma";
// import { z } from "zod";
// import {
//   CreateProductSchema,
//   UpdateProductSchema,
//   SearchQueryType,
//   ProductQueryParams,
//   ProductCursorQueryParams,
// } from "@/shared/schemas/product.schema";
// import { NotFoundError, BadRequestError } from "@/shared/utils/AppError";
// import {
//   uploadToCloudinary,
//   deleteFromCloudinary,
// } from "@/core/services/cloudinary.service";
// import fs from "fs";

// export class ProductService {
//   /**
//    * Generates a unique slug for the product.
//    */
//   private static generateSlug(name: string): string {
//     return (
//       name
//         .toLowerCase()
//         .replace(/[^a-z0-9]+/g, "-")
//         .replace(/(^-|-$)+/g, "") +
//       "-" +
//       Math.floor(Math.random() * 10000)
//     );
//   }

//   static async createProduct(
//     companyId: string | undefined,
//     data: z.infer<typeof CreateProductSchema>,
//     files?: Express.Multer.File[],
//   ) {
//     const slug = this.generateSlug(data.name);

//     let processedImages: any[] = [];

//     if (files && files.length > 0) {
//       // Map multer files into the shape processImages expects, then let it handle Cloudinary upload
//       const fileImages = files.map((file, idx) => ({
//         imageUrl: file.path, // local disk path — processImages detects isLocalFile
//         altText: data.name,
//         isPrimary: idx === 0,
//         sortOrder: idx,
//         cloudinaryPublicId: null,
//       }));
//       processedImages = await this.processImages(fileImages);
//     } else if (data.images && data.images.length > 0) {
//       processedImages = await this.processImages(data.images);
//     }

//     return prisma.product.create({
//       data: {
//         name: data.name,
//         slug,
//         description: data.description,
//         price: data.price,
//         minPrice: data.minPrice,
//         maxPrice: data.maxPrice,
//         stockQuantity: data.stockQuantity,
//         commissionRate: data.commissionRate,
//         companyId,
//         categoryId: data.categoryId,
//         status: data.status,
//         variants: {
//           create: data.variants?.map((v) => ({
//             sku: v.sku,
//             size: v.size,
//             color: v.color,
//             images: v.images,
//             stockQuantity: v.stockQuantity,
//             price: v.price,
//           })),
//         },
//         installmentPlans: {
//           create: data.installmentPlans?.map((p) => ({
//             durationMonths: p.durationMonths,
//             interestPercentage: p.interestPercentage,
//             active: p.active ?? true,
//           })),
//         },
//         images: {
//           create: processedImages,
//         },
//       },
//       include: { variants: true, installmentPlans: true, images: true },
//     });
//   }

//   static async updateProduct(
//     productId: string,
//     data: z.infer<typeof UpdateProductSchema>,
//     files?: Express.Multer.File[],
//   ) {
//     const product = await prisma.product.findUnique({
//       where: { productId },
//       include: { images: true, variants: true },
//     });
//     if (!product) throw new NotFoundError("Product not found");

//     let processedImages: any[] | undefined = undefined;
//     const hasNewFiles = files && files.length > 0;
//     const hasNewUrls = data.images && data.images.length > 0;

//     if (hasNewFiles || hasNewUrls) {
//       // Delete old Cloudinary assets and DB records for either path
//       for (const oldImg of product.images) {
//         if (oldImg.cloudinaryPublicId) {
//           await deleteFromCloudinary(oldImg.cloudinaryPublicId);
//         }
//       }
//       await prisma.productImage.deleteMany({
//         where: { productId: product.id },
//       });

//       if (hasNewFiles) {
//         const fileImages = files!.map((file, idx) => ({
//           imageUrl: file.path, // local disk path — processImages detects isLocalFile
//           altText: data.name ?? product.name,
//           isPrimary: idx === 0,
//           sortOrder: idx,
//           cloudinaryPublicId: null,
//         }));
//         processedImages = await this.processImages(fileImages);
//       } else {
//         processedImages = await this.processImages(data.images!);
//       }
//     }

//     const updateData: any = {
//       name: data.name,
//       description: data.description,
//       price: data.price,
//       minPrice: data.minPrice,
//       maxPrice: data.maxPrice,
//       stockQuantity: data.stockQuantity,
//       commissionRate: data.commissionRate,
//       categoryId: data.categoryId,
//       status: data.status,
//       images: processedImages ? { create: processedImages } : undefined,
//     };

//     // Handle sold-out status auto-detection
//     if (data.stockQuantity !== undefined) {
//       const currentStock = data.stockQuantity;
//       const variantStocks = product.variants || [];
//       const totalVariantStock = variantStocks.reduce(
//         (sum: number, v: any) => sum + (v.stockQuantity || 0),
//         0,
//       );

//       if (currentStock === 0 && totalVariantStock === 0) {
//         updateData.status = "SOLD_OUT";
//       } else if (
//         updateData.status === "SOLD_OUT" &&
//         (currentStock > 0 || totalVariantStock > 0)
//       ) {
//         updateData.status = "PUBLISHED";
//       }
//     }

//     return prisma.product.update({
//       where: { productId },
//       data: updateData,
//       include: { variants: true, installmentPlans: true, images: true },
//     });
//   }

//   static async getAllProducts(params: ProductQueryParams) {
//     const {
//       page = 1,
//       limit = 10,
//       sortOrder = "desc",
//       category,
//       companyId,
//     } = params;
//     const skip = (page - 1) * limit;

//     const whereClause: any = {
//       status: "PUBLISHED",
//     };

//     if (companyId) {
//       whereClause.companyId = companyId;
//     }

//     if (category) {
//       whereClause.category = {
//         OR: [
//           { name: { equals: category, mode: "insensitive" } },
//           { slug: { equals: category, mode: "insensitive" } },
//         ],
//       };
//     }

//     const [products, total] = await prisma.$transaction([
//       prisma.product.findMany({
//         where: whereClause,
//         skip,
//         take: limit,
//         orderBy: { createdAt: sortOrder },
//         include: {
//           images: true,
//           category: true,
//           variants: true,
//           installmentPlans: {
//             where: { active: true },
//             orderBy: { durationMonths: "asc" },
//           },
//         },
//       }),
//       prisma.product.count({ where: whereClause }),
//     ]);

//     const productsWithBreakdowns = products.map((product) =>
//       this.attachBreakdowns(product),
//     );
//     const totalPages = Math.ceil(total / limit);

//     const pagination = {
//       total,
//       totalPages,
//       currentPage: page,
//       limit,
//       hasNextPage: page < totalPages,
//       hasPreviousPage: page > 1,
//     };

//     return { products: productsWithBreakdowns, pagination };
//   }

//   /**
//    * Get all products with cursor-based pagination and optional category/company filters.
//    */
//   static async getAllProductCursor(params: ProductCursorQueryParams) {
//     const {
//       limit = 10,
//       cursor,
//       sortOrder = "desc",
//       category,
//       companyId,
//     } = params;

//     const whereClause: any = {
//       status: "PUBLISHED",
//     };

//     if (companyId) {
//       whereClause.companyId = companyId;
//     }

//     if (category) {
//       whereClause.category = {
//         OR: [
//           { name: { equals: category, mode: "insensitive" } },
//           { slug: { equals: category, mode: "insensitive" } },
//         ],
//       };
//     }

//     if (cursor) {
//       if (sortOrder === "desc") {
//         whereClause.id = { lte: BigInt(cursor) };
//       } else {
//         whereClause.id = { gte: BigInt(cursor) };
//       }
//     }

//     const products = await prisma.product.findMany({
//       where: whereClause,
//       take: limit + 1,
//       orderBy: { id: sortOrder },
//       include: {
//         images: true,
//         category: true,
//         variants: true,
//         installmentPlans: {
//           where: { active: true },
//           orderBy: { durationMonths: "asc" },
//         },
//       },
//     });

//     const productsWithBreakdowns = products.map((product) =>
//       this.attachBreakdowns(product),
//     );

//     let nextCursor: string | null = null;
//     if (productsWithBreakdowns.length > limit) {
//       const nextItem = productsWithBreakdowns.pop();
//       nextCursor = nextItem ? nextItem.id.toString() : null;
//     }

//     const prevCursor = productsWithBreakdowns.length
//       ? productsWithBreakdowns[0].id.toString()
//       : null;

//     const pagination = {
//       limit,
//       nextCursor,
//       prevCursor,
//       hasNextPage: !!nextCursor,
//       hasPreviousPage: !!cursor,
//       nextLink: nextCursor
//         ? `/products/cursor?cursor=${nextCursor}&limit=${limit}${category ? `&category=${encodeURIComponent(category)}` : ""}`
//         : null,
//       prevLink: prevCursor
//         ? `/products/cursor?cursor=${prevCursor}&limit=${limit}${category ? `&category=${encodeURIComponent(category)}` : ""}`
//         : null,
//     };

//     return { products: productsWithBreakdowns, pagination };
//   }

//   /**
//    * Perfected Full-Text Search using PostgreSQL GIN indexes and plainto_tsquery, combined with Prisma relations.
//    */
//   static async searchProducts(params: SearchQueryType) {
//     const { search: q, page = 1, limit = 10, minPrice, maxPrice } = params;
//     const offset = (page - 1) * limit;

//     // 1. Run raw query to search by vector and get matched IDs & ranks
//     const matchResults = await prisma.$queryRaw<any[]>`
//       SELECT
//         p.id,
//         ts_rank(p.search_vector, plainto_tsquery('english', ${q})) AS rank
//       FROM "Product" p
//       WHERE
//         p.status = 'PUBLISHED'
//         AND p.search_vector @@ plainto_tsquery('english', ${q})
//       ORDER BY rank DESC
//       LIMIT ${limit}
//       OFFSET ${offset}
//     `;

//     // 2. Count total matches
//     const totalResult = await prisma.$queryRaw<any[]>`
//       SELECT COUNT(*)::int AS total
//       FROM "Product" p
//       WHERE
//         p.status = 'PUBLISHED'
//         AND p.search_vector @@ plainto_tsquery('english', ${q})
//     `;

//     const total = totalResult[0]?.total || 0;
//     const totalPages = Math.ceil(total / limit);

//     if (matchResults.length === 0) {
//       return {
//         products: [],
//         pagination: {
//           total,
//           totalPages,
//           currentPage: page,
//           limit,
//           hasNextPage: page < totalPages,
//           hasPreviousPage: page > 1,
//         },
//       };
//     }

//     const matchedIds = matchResults.map((r) => r.id);

//     // 3. Query complete products from database using matched IDs
//     const products = await prisma.product.findMany({
//       where: {
//         id: { in: matchedIds },
//         // Apply price filters in prisma if supplied
//         ...(minPrice !== undefined ? { price: { gte: minPrice } } : {}),
//         ...(maxPrice !== undefined ? { price: { lte: maxPrice } } : {}),
//       },
//       include: {
//         images: true,
//         category: true,
//         variants: true,
//         installmentPlans: {
//           where: { active: true },
//           orderBy: { durationMonths: "asc" },
//         },
//       },
//     });

//     // 4. Map back to products and attach breakdowns, then sort by rank matching order of matchResults
//     const productsWithBreakdowns = products.map((p) =>
//       this.attachBreakdowns(p),
//     );

//     // Sort products by the rank order returned by matchedIds
//     const matchedIdMap = new Map(
//       matchedIds.map((id, index) => [id.toString(), index]),
//     );
//     productsWithBreakdowns.sort((a, b) => {
//       const indexA = matchedIdMap.get(a.id.toString()) ?? 999;
//       const indexB = matchedIdMap.get(b.id.toString()) ?? 999;
//       return indexA - indexB;
//     });

//     return {
//       products: productsWithBreakdowns,
//       pagination: {
//         total,
//         totalPages,
//         currentPage: page,
//         limit,
//         hasNextPage: page < totalPages,
//         hasPreviousPage: page > 1,
//       },
//     };
//   }

//   /**
//    * Get a single product by ID.
//    */
//   static async getProductById(productId: string) {
//     const product = await prisma.product.findUnique({
//       where: { productId },
//       include: {
//         variants: true,
//         installmentPlans: {
//           where: { active: true },
//           orderBy: { durationMonths: "asc" },
//         },
//         category: true,
//         images: true,
//       },
//     });

//     if (!product) throw new NotFoundError("Product not found");

//     return this.attachBreakdowns(product);
//   }

//   /**
//    * Update a product (Note: Does not perform full nested sync for simplicity. Usually better to delete/recreate variants).
//    */
//   // static async updateProduct(
//   //   productId: string,
//   //   data: z.infer<typeof UpdateProductSchema>,
//   // ) {
//   //   const product = await prisma.product.findUnique({
//   //     where: { productId },
//   //     include: { images: true },
//   //   });
//   //   if (!product) throw new NotFoundError("Product not found");

//   //   let processedImages: any[] | undefined = undefined;
//   //   if (data.images) {
//   //     // 1. Delete old images from Cloudinary
//   //     for (const oldImg of product.images) {
//   //       if (oldImg.cloudinaryPublicId) {
//   //         await deleteFromCloudinary(oldImg.cloudinaryPublicId);
//   //       }
//   //     }

//   //     // 2. Remove old images from DB
//   //     await prisma.productImage.deleteMany({
//   //       where: { productId: product.id },
//   //     });

//   //     // 3. Process new images
//   //     processedImages = await this.processImages(data.images);
//   //   }

//   //   return prisma.product.update({
//   //     where: { productId },
//   //     data: {
//   //       name: data.name,
//   //       description: data.description,
//   //       price: data.price,
//   //       minPrice: data.minPrice,
//   //       maxPrice: data.maxPrice,
//   //       stockQuantity: data.stockQuantity,
//   //       commissionRate: data.commissionRate,
//   //       categoryId: data.categoryId,
//   //       isActive: data.active,
//   //       images: processedImages
//   //         ? {
//   //             create: processedImages,
//   //           }
//   //         : undefined,
//   //     },
//   //     include: {
//   //       variants: true,
//   //       installmentPlans: true,
//   //       images: true,
//   //     },
//   //   });
//   // }

//   /**
//    * Soft delete a product.
//    */
//   static async deleteProduct(productId: string) {
//     const product = await prisma.product.findUnique({
//       where: { productId },
//       include: {
//         kycApplications: {
//           where: {
//             status: {
//               in: ["PENDING", "APPROVED"],
//             },
//           },
//         },
//         financingContracts: {
//           where: {
//             status: {
//               in: ["ACTIVE", "PENDING_ACTIVATION", "RESTRUCTURED"],
//             },
//           },
//         },
//       },
//     });

//     if (!product) {
//       throw new NotFoundError("Product not found");
//     }

//     if (
//       product.kycApplications.length > 0 ||
//       product.financingContracts.length > 0
//     ) {
//       return prisma.product.update({
//         where: { productId },
//         data: { status: ProductStatus.ARCHIVED },
//       });
//     }

//     return prisma.product.update({
//       where: { productId },
//       data: { status: ProductStatus.ARCHIVED },
//     });
//   }

//   /**
//    * Helper method to attach breakdown calculations to a product.
//    */
//   private static attachBreakdowns(product: any) {
//     const plans = product.installmentPlans || [];
//     const variants = product.variants || [];

//     // Calculate breakdowns
//     const breakdowns: any[] = [];

//     if (variants.length > 0) {
//       // If variants exist, calculate breakdown per variant per plan
//       variants.forEach((variant: any) => {
//         const basePrice = Number(variant.price);
//         plans.forEach((plan: any) => {
//           const interestRate = Number(plan.interestPercentage) / 100;
//           const totalPrice = basePrice * (1 + interestRate);
//           const monthlyPayment = totalPrice / plan.durationMonths;

//           breakdowns.push({
//             variantId: variant.variantId,
//             sku: variant.sku,
//             planId: plan.planId,
//             durationMonths: plan.durationMonths,
//             interestPercentage: Number(plan.interestPercentage),
//             basePrice: basePrice,
//             totalPrice: Number(totalPrice.toFixed(2)),
//             monthlyPayment: Number(monthlyPayment.toFixed(2)),
//           });
//         });
//       });
//     } else {
//       // If no variants, use product base price
//       const basePrice = Number(product.price);
//       plans.forEach((plan: any) => {
//         const interestRate = Number(plan.interestPercentage) / 100;
//         const totalPrice = basePrice * (1 + interestRate);
//         const monthlyPayment = totalPrice / plan.durationMonths;

//         breakdowns.push({
//           planId: plan.planId,
//           durationMonths: plan.durationMonths,
//           interestPercentage: Number(plan.interestPercentage),
//           basePrice: basePrice,
//           totalPrice: Number(totalPrice.toFixed(2)),
//           monthlyPayment: Number(monthlyPayment.toFixed(2)),
//         });
//       });
//     }

//     return {
//       ...product,
//       installmentBreakdown: breakdowns,
//     };
//   }

//   /**
//    * Helper to process and upload raw/base64/local image files to Cloudinary.
//    */
//   private static async processImages(images: any[]): Promise<any[]> {
//     if (!images || images.length === 0) return [];

//     const processed = [];
//     for (const img of images) {
//       let imageUrl = img.imageUrl;
//       let cloudinaryPublicId = img.cloudinaryPublicId;

//       const isBase64 =
//         imageUrl.startsWith("data:image/") ||
//         imageUrl.startsWith("data:application/");
//       const isLocalFile =
//         !imageUrl.startsWith("http://") &&
//         !imageUrl.startsWith("https://") &&
//         fs.existsSync(imageUrl);

//       if (isBase64 || isLocalFile) {
//         try {
//           const uploadResult = await uploadToCloudinary(imageUrl, "products");

//           // Cleanup local temp files to prevent filling the disk
//           if (isLocalFile && fs.existsSync(imageUrl)) {
//             fs.unlink(imageUrl, (err) => {
//               if (err)
//                 console.error(`Failed to delete temp file ${imageUrl}:`, err);
//             });
//           }

//           imageUrl = uploadResult.url;
//           cloudinaryPublicId = uploadResult.public_id;
//         } catch (error) {
//           if (isLocalFile && fs.existsSync(imageUrl)) {
//             fs.unlink(imageUrl, () => {});
//           }
//           console.error(
//             "Failed to upload image to Cloudinary during product image processing:",
//             error,
//           );
//           throw error;
//         }
//       }

//       processed.push({
//         imageUrl,
//         altText: img.altText || null,
//         isPrimary: img.isPrimary ?? false,
//         sortOrder: img.sortOrder ?? 0,
//         cloudinaryPublicId: cloudinaryPublicId || null,
//       });
//     }

//     return processed;
//   }
// }
