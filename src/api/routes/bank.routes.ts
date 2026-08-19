import { Router } from "express";
import { BankController } from "@/api/controllers/bank.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { requireActiveSubscription } from "@/api/middlewares/subscription.guard";
import { requireActiveCompany } from "@/api/middlewares/company-status.guard";
import { COMMISSION_ELIGIBLE_ROLES } from "@/shared/utils/helpers/commission-eligibility";

const router = Router();

router.use(requireAuth, requireActiveSubscription, requireActiveCompany);

router.post(
  "/create",
  requireRole(COMMISSION_ELIGIBLE_ROLES),
  BankController.addBankAccount,
);

router.get(
  "/",
  requireRole(COMMISSION_ELIGIBLE_ROLES),
  BankController.listBankAccounts,
);

router.patch(
  "/set-primary",
  requireRole(COMMISSION_ELIGIBLE_ROLES),
  BankController.switchPrimaryBankAccount,
);

router.delete(
  "/",
  requireRole(COMMISSION_ELIGIBLE_ROLES),
  BankController.removeBankAccount,
);

export default router;
