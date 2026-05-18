import { Router } from "express";
import { CustomerManagementController } from "@/api/controllers/customer-management.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth);

// Corporate full hierarchy tree (Company/SuperAdmin only)
router.get(
  "/hierarchy",
  requireRole([Role.COMPANY, Role.SUPER_ADMIN]),
  CustomerManagementController.getCorporateHierarchy,
);

// Scoped customer listing
router.get(
  "/",
  requireRole([Role.MARKETER, Role.ADMIN, Role.COMPANY, Role.SUPER_ADMIN]),
  CustomerManagementController.listCustomers,
);

// Ongoing purchase contracts of a customer
router.get(
  "/:id/products",
  requireRole([Role.MARKETER, Role.ADMIN, Role.COMPANY, Role.SUPER_ADMIN]),
  CustomerManagementController.getCustomerProducts,
);

// Installment schedule + completion progress percentage of a customer for a product
router.get(
  "/:id/products/:productId/schedule",
  requireRole([Role.CUSTOMER, Role.MARKETER, Role.ADMIN, Role.COMPANY, Role.SUPER_ADMIN]),
  CustomerManagementController.getInstallmentSchedule,
);

// Payment history logs of a customer
router.get(
  "/:id/payments",
  requireRole([Role.CUSTOMER, Role.MARKETER, Role.ADMIN, Role.COMPANY, Role.SUPER_ADMIN]),
  CustomerManagementController.getCustomerPaymentHistory,
);

export default router;
