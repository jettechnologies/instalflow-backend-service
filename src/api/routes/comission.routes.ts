import { Router } from "express";
import { CommissionController } from "@/api/controllers/comission.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth);

router.get(
  "/all-time",
  requireRole([Role.MARKETER]),
  CommissionController.allTime,
);

router.get(
  "/per-customer",
  requireRole([Role.MARKETER]),
  CommissionController.perCustomer,
);

router.get(
  "/per-product",
  requireRole([Role.MARKETER]),
  CommissionController.perProduct,
);

router.post(
  "/request-payout",
  requireRole([Role.MARKETER]),
  CommissionController.requestPayout,
);

router.post(
  "/payouts/:id/admin-approve",
  requireRole([Role.ADMIN]),
  CommissionController.adminApprove,
);

router.post(
  "/payouts/:id/company-approve",
  requireRole([Role.COMPANY]),
  CommissionController.companyApprove,
);

export default router;
