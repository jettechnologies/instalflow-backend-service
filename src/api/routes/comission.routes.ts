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

router.get(
  "/payouts",
  requireRole([Role.MARKETER, Role.ADMIN, Role.COMPANY]),
  CommissionController.getPayoutRequests,
);

router.get(
  "/payouts/:id",
  requireRole([Role.MARKETER, Role.ADMIN, Role.COMPANY]),
  CommissionController.getPayoutById,
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

router.post(
  "/payouts/:id/initiate-transfer",
  requireRole([Role.COMPANY]),
  CommissionController.initiateTransfer,
);

router.post(
  "/payouts/bulk/initiate-transfer",
  requireRole([Role.COMPANY]),
  CommissionController.initiateBulkTransfer,
);

export default router;
