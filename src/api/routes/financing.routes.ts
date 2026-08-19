import { Router } from "express";
import { FinancingController } from "@/api/controllers/financing.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { requireActiveSubscription } from "@/api/middlewares/subscription.guard";
import { requireActiveCompany } from "@/api/middlewares/company-status.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.post(
  "/:id/restructure",
  requireAuth,
  requireActiveSubscription,
  requireActiveCompany,
  requireRole([Role.ADMIN, Role.COMPANY]),
  FinancingController.restructureContract,
);

router.post(
  "/:id/write-off",
  requireAuth,
  requireActiveSubscription,
  requireActiveCompany,
  requireRole([Role.COMPANY]),
  FinancingController.writeOffContract,
);

export default router;
