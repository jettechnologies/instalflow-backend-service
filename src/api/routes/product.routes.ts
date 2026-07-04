import { Router } from "express";
import { ProductController } from "@/api/controllers/product.controller";
import { VariantController } from "@/api/controllers/variant.controller";
import { ProductImageController } from "@/api/controllers/product-image.controller";
import { InstallmentPlanController } from "@/api/controllers/installment-plan.controller";

import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

import { uploadMultiple } from "@/api/middlewares/multer.middlewares";

const router = Router();

router.use(requireAuth);

router.get("/", ProductController.getProducts);

router.get("/cursor", ProductController.getProductsCursor);

router.get("/search", ProductController.searchProducts);

router.get("/:id", ProductController.getProductById);

router.get("/:productId/gallery", ProductImageController.getGallery);

// router.get("/:productId/variants", VariantController.getVariantsByProduct);

router.get(
  "/:productId/installment-plans",
  InstallmentPlanController.getInstallmentPlansByProduct,
);

router.use(requireRole([Role.COMPANY, Role.ADMIN, Role.SUPER_ADMIN]));

router.post("/", ProductController.createProduct);

router.post("/bulk", ProductController.createProductsBulk);

router.patch("/:id", ProductController.updateProduct);

router.delete("/:id", ProductController.deleteProduct);

router.post(
  "/:productId/gallery",
  uploadMultiple("images"),
  ProductImageController.uploadGalleryImages,
);

router.patch(
  "/:productId/gallery/reorder",
  ProductImageController.reorderGalleryImages,
);

router.patch(
  "/:productId/gallery/:imageId/primary",
  ProductImageController.setPrimaryImage,
);

router.patch(
  "/:productId/gallery/:imageId",
  ProductImageController.updateImageMeta,
);

router.delete(
  "/:productId/gallery/:imageId",
  ProductImageController.removeGalleryImage,
);

router.put(
  "/variants/:variantId/images",
  ProductImageController.setVariantImages,
);

router.post("/:productId/variants", VariantController.createVariant);

router.post("/:productId/variants/bulk", VariantController.bulkCreateVariants);

router.patch("/variants/:variantId", VariantController.updateVariant);

router.patch(
  "/variants/:variantId/stock",
  VariantController.updateVariantStock,
);

router.patch(
  "/variants/:variantId/status",
  VariantController.deactivateVariant,
);

// router.delete(
//   "/variants/:variantId",
//   VariantController.deleteVariant,
// );

router.post(
  "/:productId/installment-plans",
  InstallmentPlanController.createInstallmentPlan,
);

router.patch(
  "/installment-plans/:planId",
  InstallmentPlanController.updateInstallmentPlan,
);

router.patch(
  "/installment-plans/:planId/status",
  InstallmentPlanController.deactivateInstallmentPlan,
);

export default router;

// import { Router } from "express";
// import { ProductController } from "@/api/controllers/product.controller";
// import { VariantController } from "@/api/controllers/variant.controller";
// import { ProductImageController } from "@/api/controllers/product-image.controller";
// import { InstallmentPlanController } from "@/api/controllers/installment-plan.controller";
// import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
// import { Role } from "@/infrastructure/prisma";
// import {
//   uploadMultiple,
//   validateUploadedFileSizes,
// } from "@/api/middlewares/multer.middlewares";

// const router = Router();

// // Read routes: Accessible by any authenticated user (Customer, Marketer, Admin, Company)
// router.get("/", requireAuth, ProductController.getProducts);
// router.get("/cursor", requireAuth, ProductController.getProductsCursor);
// router.get("/search", requireAuth, ProductController.searchProducts);
// router.get("/:id", requireAuth, ProductController.getProductById);

// // Write routes: Protected to COMPANY and ADMIN roles
// router.use(requireAuth);
// router.use(requireRole([Role.COMPANY, Role.ADMIN, Role.SUPER_ADMIN]));

// router.post(
//   "/",
//   ProductController.createProduct,
// );
// router.post(
//   "/bulk",
//   ProductController.createProductsBulk,
// );
// router.patch(
//   "/:id",
//   ProductController.updateProduct,
// );
// router.delete("/:id", ProductController.deleteProduct);

// // Variant management routes
// router.get("/:productId/variants", VariantController.getVariantsByProduct);
// router.post("/:productId/variants", VariantController.createVariant);
// router.post("/:productId/variants/bulk", VariantController.bulkCreateVariants);
// router.patch("/variants/:variantId/stock", VariantController.updateVariantStock);
// router.patch("/variants/:variantId/status", VariantController.deactivateVariant);
// router.patch("/variants/:variantId", VariantController.updateVariant);
// router.delete("/variants/:variantId", VariantController.deleteVariant);

// // Product image management routes
// router.get("/:productId/images", ProductImageController.getProductImages);
// router.post(
//   "/:productId/images",
//   uploadMultiple("images"),
//   ProductImageController.uploadImages,
// );
// router.patch(
//   "/:productId/images/reorder",
//   ProductImageController.reorderImages,
// );
// router.patch(
//   "/:productId/images/:imageId/primary",
//   ProductImageController.setPrimaryImage,
// );
// router.patch(
//   "/:productId/images/:imageId",
//   ProductImageController.updateImageMeta,
// );
// router.delete(
//   "/:productId/images/:imageId",
//   ProductImageController.deleteImage,
// );

// // Installment plan management routes
// router.get("/:productId/installment-plans", InstallmentPlanController.getInstallmentPlansByProduct);
// router.post("/:productId/installment-plans", InstallmentPlanController.createInstallmentPlan);
// router.patch("/installment-plans/:planId", InstallmentPlanController.updateInstallmentPlan);
// router.patch("/installment-plans/:planId/status", InstallmentPlanController.deactivateInstallmentPlan);

// export default router;
