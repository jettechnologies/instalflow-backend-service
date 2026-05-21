import { Router } from "express";
import { AdminController } from "@/api/controllers/admin.controller";
// import { authGuard, roleGuard } from "@/api/middlewares/auth.middleware";
import { requireAuth, requireRole } from "../middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

// All routes require authentication and ADMIN role
router.use(requireAuth);

router.get(
  "/marketers",
  requireRole([Role.ADMIN, Role.COMPANY]),
  AdminController.getAdminMarketers,
);

router.use(requireRole([Role.ADMIN]));

// Maker-Checker Requests
router.post(
  "/marketers/:id/request-toggle",
  AdminController.requestToggleMarketer,
);
router.post(
  "/marketers/:id/request-delete",
  AdminController.requestDeleteMarketer,
);

export default router;
