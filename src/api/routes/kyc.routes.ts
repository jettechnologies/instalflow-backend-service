import { Router } from "express";
import { KycController } from "@/api/controllers/kyc.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

// Public customer registration from referer invites
router.post("/register", KycController.registerViaReferral);

// Authenticated route group
router.use(requireAuth);

// Customer application submissions
router.post(
  "/submit",
  requireRole([Role.CUSTOMER]),
  KycController.submitApplication,
);

// Marketer unique referral links creation
router.post(
  "/referral-link",
  requireRole([Role.MARKETER]),
  KycController.generateReferralLink,
);

// Reviewer approval endpoint
router.post(
  "/applications/:id/approve",
  requireRole([Role.MARKETER, Role.ADMIN, Role.SUPER_ADMIN]),
  KycController.approveApplication,
);

// Admin-only rejection endpoint
router.post(
  "/applications/:id/reject",
  requireRole([Role.ADMIN, Role.SUPER_ADMIN]),
  KycController.rejectApplication,
);

// Admin/Marketer secure document signed retrieval
router.get(
  "/applications/:id/document",
  requireRole([Role.MARKETER, Role.ADMIN, Role.SUPER_ADMIN]),
  KycController.getSignedDocumentUrl,
);

// In-app alert notifications retrieval and updates
router.get("/notifications", KycController.getNotifications);
router.patch("/notifications/:id/read", KycController.markAsRead);

export default router;
