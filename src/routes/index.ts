import { Router } from "express";
import authRoutes from "./auth.routes.js";
import subscriptionRoutes from "./subscription.routes.js";
import superadminRoutes from "./superadmin.routes.js";
import { CsrfController } from "../controllers/csrf.controller.js";
import { WebhookController } from "../controllers/webhook.controller.js";
const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

router.get("/csrf-token", CsrfController.generateToken);

// Webhooks (Exempt from CSRF if you have a CSRF middleware globally)
router.post("/webhooks/paystack", WebhookController.handlePaystack);

router.use("/auth", authRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/superadmin", superadminRoutes);

export default router;
