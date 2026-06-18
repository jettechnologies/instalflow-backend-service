import { Router } from "express";
import { CompanyController } from "@/api/controllers/company.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

// All routes require authentication and COMPANY role
router.use(requireAuth);
router.use(requireRole([Role.COMPANY]));

// Admin Management
router.get("/admins", CompanyController.getAssociatedAdmins);
router.get("/admins/:adminId", CompanyController.getAdminDetails);
router.get("/admins/:adminId/marketers", CompanyController.getAdminMarketers);
router.post("/admins", CompanyController.createAdmin);
router.patch("/admins/:id/status", CompanyController.toggleAdmin);
router.delete("/admins/:id", CompanyController.deleteAdmin);

// Maker-Checker Approvals
router.get("/approvals", CompanyController.getApprovals);
router.post("/approvals/:requestId", CompanyController.handleApproval);

export default router;
