import { Router } from "express";
import { CompanyController } from "@/api/controllers/company.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { requireActiveSubscription } from "@/api/middlewares/subscription.guard";
import { requireActiveCompany } from "@/api/middlewares/company-status.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

// All routes require authentication and COMPANY role
router.use(requireAuth, requireActiveSubscription, requireActiveCompany);
router.use(requireRole([Role.COMPANY]));

// Admin Management
router.get("/admins", CompanyController.getAssociatedAdmins);
router.get("/admins/:adminId", CompanyController.getAdminDetails);
router.get("/admins/:adminId/marketers", CompanyController.getAdminMarketers);
router.post("/admins", CompanyController.createAdmin);
router.patch("/admins/:id/status", CompanyController.toggleAdmin);
router.delete("/admins/:id", CompanyController.deleteAdmin);
router.patch(
  "/marketers/:marketerId/toggle-status",
  CompanyController.toggleCompanyMarketerStatus,
);
router.delete(
  "/marketers/:marketerId",
  CompanyController.toggleCompanyMarketerStatus,
);

// Maker-Checker Approvals
router.get("/pending-approvals", CompanyController.getPendingApprovals);
router.get("/approvals", CompanyController.getApprovalsByStatus);
router.post("/approvals/:requestId", CompanyController.handleApproval);

// Reminder cadence configuration
router.get("/reminder-settings", CompanyController.getReminderSettings);
router.patch("/reminder-settings", CompanyController.updateReminderSettings);

export default router;
