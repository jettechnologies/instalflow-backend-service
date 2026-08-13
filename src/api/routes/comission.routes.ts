import { Router } from "express";
import { CommissionController } from "@/api/controllers/comission.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { requireActiveSubscription } from "@/api/middlewares/subscription.guard";
import { Role } from "@/infrastructure/prisma";
import { COMMISSION_ELIGIBLE_ROLES } from "@/shared/utils/helpers/commission-eligibility";

const router = Router();

router.use(requireAuth, requireActiveSubscription);

router.get(
  "/all-time",
  requireRole(COMMISSION_ELIGIBLE_ROLES),
  CommissionController.allTime,
);

router.get(
  "/per-customer",
  requireRole(COMMISSION_ELIGIBLE_ROLES),
  CommissionController.perCustomer,
);

router.get(
  "/per-product",
  requireRole(COMMISSION_ELIGIBLE_ROLES),
  CommissionController.perProduct,
);

router.post(
  "/request-payout",
  requireRole(COMMISSION_ELIGIBLE_ROLES),
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
