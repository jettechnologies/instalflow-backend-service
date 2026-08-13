import { Router } from "express";
import { CompanyBankController } from "@/api/controllers/company-bank.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.COMPANY]));

router.post("/create", CompanyBankController.addBankAccount);
router.get("/", CompanyBankController.listBankAccounts);
router.patch("/set-primary", CompanyBankController.switchPrimaryBankAccount);
router.delete("/", CompanyBankController.removeBankAccount);

export default router;
