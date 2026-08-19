import { Router } from "express";
import { SuperAdminController } from "@/api/controllers/superadmin.controller";
import { LedgerReconciliationController } from "@/api/controllers/ledger-reconciliation.controller";
import { TenantController } from "@/api/controllers/tenant.controller";
import { PlatformRevenueController } from "@/api/controllers/platform-revenue.controller";
import { LedgerCorrectionController } from "@/api/controllers/ledger-correction.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";

const router = Router();

// All routes here require SuperAdmin privileges
router.use(requireAuth, requireRole(["SUPER_ADMIN"]));

// ─── Platform overview ────────────────────────────────────────────────────
router.get("/overview", PlatformRevenueController.getOverview);

// ─── Tenant management (directory, profile, activity) ────────────────────
router.get("/tenants", TenantController.listTenants);
router.get("/tenants/:companyId", TenantController.getTenantProfile);
router.patch("/tenants/:companyId/status", TenantController.setTenantStatus);
router.get("/tenants/:companyId/activity", TenantController.getTenantActivity);
router.get(
  "/tenants/:companyId/revenue",
  PlatformRevenueController.getTenantRevenue,
);

// ─── Cross-tenant revenue leaderboards ────────────────────────────────────
router.get("/revenue/tenants", PlatformRevenueController.getTenantLeaderboard);
router.get(
  "/revenue/products",
  PlatformRevenueController.getProductLeaderboard,
);

// ─── Subscription plan management ────────────────────────────────────────────
router.get("/plans", SuperAdminController.getPlans);
router.post("/plans", SuperAdminController.createPlan);
router.patch("/plans/:planId", SuperAdminController.updatePlan);
router.patch("/plans/:planId/toggle", SuperAdminController.toggleStatus);
router.delete("/plans/:planId", SuperAdminController.deletePlan);

// ─── Ledger reconciliation (Redis cache reads) ────────────────────────────────
router.get(
  "/ledger/reconciliation/summary",
  LedgerReconciliationController.getSummary,
);
router.get(
  "/ledger/reconciliation/accounts",
  LedgerReconciliationController.getAllAccounts,
);
router.get(
  "/ledger/reconciliation/accounts/:accountId",
  LedgerReconciliationController.getAccount,
);
router.delete(
  "/ledger/reconciliation/cache",
  LedgerReconciliationController.invalidateCache,
);

// ─── Ledger manual corrections (writes, unlike reconciliation's reads above) ──
router.post("/ledger/corrections", LedgerCorrectionController.postCorrection);

export default router;
