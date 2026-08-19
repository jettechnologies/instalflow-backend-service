import { Router } from "express";
import { CompanyBankController } from "@/api/controllers/company-bank.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { requireActiveSubscription } from "@/api/middlewares/subscription.guard";
import { requireActiveCompany } from "@/api/middlewares/company-status.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth, requireActiveSubscription, requireActiveCompany);
router.use(requireRole([Role.COMPANY]));

router.post("/create", CompanyBankController.addBankAccount);
router.get("/", CompanyBankController.listBankAccounts);
router.patch("/set-primary", CompanyBankController.switchPrimaryBankAccount);
router.delete("/", CompanyBankController.removeBankAccount);

export default router;
