import { Router } from "express";
import { SuperAdminController } from "@/api/controllers/superadmin.controller";
import { LedgerReconciliationController } from "@/api/controllers/ledger-reconciliation.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";

const router = Router();

// All routes here require SuperAdmin privileges
router.use(requireAuth, requireRole(["SUPER_ADMIN"]));

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

export default router;
