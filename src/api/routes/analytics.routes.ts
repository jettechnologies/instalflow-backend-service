import { Router } from "express";
import { AnalyticsController } from "@/api/controllers/analytics.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth);

// Role-specific dashboard overviews
router.get(
  "/overview/company",
  requireRole([Role.COMPANY]),
  AnalyticsController.getCompanyOverview,
);
router.get(
  "/overview/admin",
  requireRole([Role.ADMIN]),
  AnalyticsController.getAdminOverview,
);
router.get(
  "/overview/marketer",
  requireRole([Role.MARKETER]),
  AnalyticsController.getMarketerOverview,
);
router.get(
  "/overview/customer",
  requireRole([Role.CUSTOMER]),
  AnalyticsController.getCustomerOverview,
);

// Shared analytics endpoints
router.get(
  "/financing",
  requireRole([Role.COMPANY, Role.ADMIN, Role.MARKETER, Role.CUSTOMER]),
  AnalyticsController.getFinancingStats,
);
router.get(
  "/kyc/funnel",
  requireRole([Role.COMPANY, Role.ADMIN, Role.MARKETER]),
  AnalyticsController.getKycFunnelStats,
);
router.get(
  "/collections",
  requireRole([Role.COMPANY]),
  AnalyticsController.getCollectionStats,
);
router.get(
  "/products/performance",
  requireRole([Role.COMPANY, Role.ADMIN]),
  AnalyticsController.getProductPerformance,
);

export default router;
