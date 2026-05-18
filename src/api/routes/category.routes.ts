import { Router } from "express";
import { CategoryController } from "@/api/controllers/category.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

// Read routes: Any authenticated user
router.get("/", requireAuth, CategoryController.getCategories);
router.get("/:id", requireAuth, CategoryController.getCategoryById);

// Write routes: Protected to ADMIN and COMPANY roles
router.use(requireAuth);
router.use(requireRole([Role.COMPANY, Role.ADMIN, Role.SUPER_ADMIN]));

router.post("/", CategoryController.createCategory);
router.patch("/:id", CategoryController.updateCategory);
router.delete("/:id", CategoryController.deleteCategory);

export default router;
