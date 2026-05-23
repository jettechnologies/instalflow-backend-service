import { Router } from "express";
import { KycController } from "@/api/controllers/kyc.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";
import { uploadSinglePdf } from "@/api/middlewares/multer.middlewares";
import { requireOnboardingToken } from "@/api/middlewares/kyc-onboarding.guard";
import { kycSubmitLimiter } from "../middlewares/rateLimiter";

const router = Router();

router.post("/register", KycController.registerViaReferral);

router.post(
  "/submit",
  kycSubmitLimiter,
  requireOnboardingToken,
  uploadSinglePdf("bankStatement"),
  KycController.submitApplication,
);

router.use(requireAuth);

router.post(
  "/referral-link",
  requireRole([Role.MARKETER]),
  KycController.generateReferralLink,
);

router.post(
  "/applications/:id/approve",
  requireRole([Role.MARKETER, Role.ADMIN, Role.COMPANY]),
  KycController.approveApplication,
);

router.post(
  "/applications/:id/reject",
  requireRole([Role.ADMIN, Role.COMPANY]),
  KycController.rejectApplication,
);

router.get(
  "/applications/:id/document",
  requireRole([Role.MARKETER, Role.ADMIN, Role.COMPANY]),
  KycController.getSignedDocumentUrl,
);

// In-app alert notifications retrieval and updates
// router.get("/notifications", KycController.getNotifications);
// router.patch("/notifications/:id/read", KycController.markAsRead);

export default router;
