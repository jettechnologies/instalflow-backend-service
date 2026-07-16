import { Router } from "express";
import { ProductController } from "@/api/controllers/product.controller";
import { ProductImageController } from "@/api/controllers/product-image.controller";
import { InstallmentPlanController } from "@/api/controllers/installment-plan.controller";

import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

import { uploadMultiple } from "@/api/middlewares/multer.middlewares";
import { publicApiLimiter } from "../middlewares/rateLimiter";

const router = Router();

router.get("/slug/:slug", publicApiLimiter, ProductController.getProductBySlug);

router.use(requireAuth);

router.get("/", ProductController.getProducts);

router.get("/cursor", ProductController.getProductsCursor);

router.get("/search", ProductController.searchProducts);

router.get("/:id", ProductController.getProductById);

router.get("/:productId/gallery", ProductImageController.getGallery);

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
