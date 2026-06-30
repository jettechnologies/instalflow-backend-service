import { Router } from "express";
import { FinancingController } from "@/api/controllers/financing.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.post(
  "/:id/restructure",
  requireAuth,
  requireRole([Role.ADMIN, Role.SUPER_ADMIN]),
  FinancingController.restructureContract,
);

router.post(
  "/:id/write-off",
  requireAuth,
  requireRole([Role.COMPANY]),
  FinancingController.writeOffContract,
);

export default router;
