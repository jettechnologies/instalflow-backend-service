import { Router } from "express";
import { InstallmentController } from "@/api/controllers/installment.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth);

router.get(
  "/customer",
  requireRole([Role.CUSTOMER]),
  InstallmentController.getCustomerInstallments,
);

router.get(
  "/:contractId",
  requireRole([Role.ADMIN, Role.COMPANY, Role.SUPER_ADMIN]),
  InstallmentController.getCustomerInstallments,
);

router.get(
  "/:contractId/products",
  requireRole([Role.CUSTOMER, Role.ADMIN, Role.COMPANY, Role.SUPER_ADMIN]),
  InstallmentController.getFinancedProducts,
);

router.get(
  "/:contractId/progress",
  requireRole([Role.CUSTOMER, Role.ADMIN, Role.COMPANY, Role.SUPER_ADMIN]),
  InstallmentController.getProgress,
);

router.post(
  "/:installmentId/pay",
  requireRole([Role.CUSTOMER]),
  InstallmentController.initializePayment,
);

export default router;
