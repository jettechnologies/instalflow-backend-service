import { Router } from "express";
import { SubscriptionController } from "@/api/controllers/subscription.controller";
import { publicApiLimiter } from "@/api/middlewares/rateLimiter";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { requireOnboardingToken } from "@/api/middlewares/kyc-onboarding.guard";
import { Role } from "@/infrastructure/prisma";

const router = Router();

router.get("/plans", publicApiLimiter, SubscriptionController.getPlans);
router.post("/initialize", publicApiLimiter, SubscriptionController.initialize);
router.get("/verify", publicApiLimiter, SubscriptionController.verify);
router.post(
  "/onboarding/initialize",
  publicApiLimiter,
  requireOnboardingToken,
  SubscriptionController.initializeOnboarding,
);
router.post(
  "/renew",
  requireAuth,
  requireRole([Role.COMPANY]),
  SubscriptionController.renew,
);

export default router;
