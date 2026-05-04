import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller.js";
import { requireAuth } from "../middlewares/auth.guard.js";
import { publicApiLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

router.get("/plans", publicApiLimiter, SubscriptionController.getPlans);
router.post("/initialize", requireAuth, SubscriptionController.initialize);
router.get("/verify", requireAuth, SubscriptionController.verify);

export default router;
