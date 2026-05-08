import { Router } from "express";
import authRoutes from "@/api/routes/auth.routes";
import subscriptionRoutes from "@/api/routes/subscription.routes";
import superadminRoutes from "@/api/routes/superadmin.routes";
import { CsrfController } from "@/api/controllers/csrf.controller";
import { WebhookController } from "@/api/controllers/webhook.controller";
const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

router.get("/csrf-token", CsrfController.generateToken);

// Webhooks (Exempt from CSRF if you have a CSRF middleware globally)
// router.post("/webhooks/paystack", WebhookController.handlePaystack);
router.use("/auth", authRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/superadmin", superadminRoutes);

export default router;
