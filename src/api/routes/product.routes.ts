import { Router } from "express";
import { ProductController } from "@/api/controllers/product.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";
import {
  uploadMultiple,
  validateUploadedFileSizes,
} from "@/api/middlewares/multer.middlewares";

const router = Router();

// Read routes: Accessible by any authenticated user (Customer, Marketer, Admin, Company)
router.get("/", requireAuth, ProductController.getProducts);
router.get("/cursor", requireAuth, ProductController.getProductsCursor);
router.get("/search", requireAuth, ProductController.searchProducts);
router.get("/:id", requireAuth, ProductController.getProductById);

// Write routes: Protected to COMPANY and ADMIN roles
router.use(requireAuth);
router.use(requireRole([Role.COMPANY, Role.ADMIN, Role.SUPER_ADMIN]));

router.post(
  "/",
  uploadMultiple("images"),
  validateUploadedFileSizes,
  ProductController.createProduct,
);
router.patch(
  "/:id",
  uploadMultiple("images"),
  validateUploadedFileSizes,
  ProductController.updateProduct,
);
router.delete("/:id", ProductController.deleteProduct);

export default router;
