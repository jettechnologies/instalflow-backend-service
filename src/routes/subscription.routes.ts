import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller.js";
import { publicApiLimiter } from "../middlewares/rateLimiter.js";

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
