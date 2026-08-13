import { Router } from "express";
import { MerchantSettlementController } from "@/api/controllers/merchant-settlement.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth);

// Read-only for COMPANY/ADMIN — no company-initiated approve/transfer routes
// exist here by design (settlement is fully automatic).
router.get(
  "/",
  requireRole([Role.COMPANY, Role.ADMIN, Role.SUPER_ADMIN]),
  MerchantSettlementController.listSettlements,
);

router.get(
  "/:id",
  requireRole([Role.COMPANY, Role.ADMIN, Role.SUPER_ADMIN]),
  MerchantSettlementController.getSettlementById,
);

router.get(
  "/:id/audit-trail",
  requireRole([Role.COMPANY, Role.SUPER_ADMIN]),
  MerchantSettlementController.getAuditTrail,
);

// SUPER_ADMIN-only operational recovery — not an approval step.
router.post(
  "/:id/retry",
  requireRole([Role.SUPER_ADMIN]),
  MerchantSettlementController.retryTransfer,
);

// SUPER_ADMIN-only manual/backfill trigger — the same idempotent generation
// path the weekly scheduler runs automatically.
router.post(
  "/generate",
  requireRole([Role.SUPER_ADMIN]),
  MerchantSettlementController.generate,
);

export default router;
