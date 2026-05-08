import { Router } from "express";
import { SubscriptionController } from "@/api/controllers/subscription.controller";
import { publicApiLimiter } from "@/api/middlewares/rateLimiter";

const router = Router();

router.get("/plans", publicApiLimiter, SubscriptionController.getPlans);
router.post("/initialize", publicApiLimiter, SubscriptionController.initialize);
router.get("/verify", publicApiLimiter, SubscriptionController.verify);
router.post(
  "/onboarding/initialize",
  publicApiLimiter,
  SubscriptionController.initializeOnboarding,
);

export default router;
