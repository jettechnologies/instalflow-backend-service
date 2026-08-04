import { Router } from "express";
import { BankController } from "@/api/controllers/bank.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.use(requireAuth);

router.post(
  "/create",
  requireRole([Role.MARKETER]),
  BankController.addBankAccount,
);

router.get("/", requireRole([Role.MARKETER]), BankController.listBankAccounts);

router.patch(
  "/set-primary",
  requireRole([Role.MARKETER]),
  BankController.switchPrimaryBankAccount,
);

router.delete(
  "/",
  requireRole([Role.MARKETER]),
  BankController.removeBankAccount,
);

export default router;
