import { Router } from "express";
import { VariantController } from "@/api/controllers/variant.controller";
import { ProductImageController } from "@/api/controllers/product-image.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.COMPANY, Role.ADMIN, Role.SUPER_ADMIN]));

router.post("/:productId", VariantController.createVariant);

router.post("/:productId/bulk", VariantController.bulkCreateVariants);

router.patch("/:variantId", VariantController.updateVariant);

router.patch("/:variantId/stock", VariantController.updateVariantStock);

router.patch("/:variantId/status", VariantController.deactivateVariant);

router.put("/:variantId/images", ProductImageController.setVariantImages);

// router.get("/:productId/variants", VariantController.getVariantsByProduct);

// router.delete(
//   "/variants/:variantId",
//   VariantController.deleteVariant,
// );

export default router;
