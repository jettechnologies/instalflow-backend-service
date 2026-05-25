import { Router } from "express";
import authRoutes from "@/api/routes/auth.routes";
import subscriptionRoutes from "@/api/routes/subscription.routes";
import superadminRoutes from "@/api/routes/superadmin.routes";
import { CsrfController } from "@/api/controllers/csrf.controller";
import { WebhookController } from "@/api/controllers/webhook.controller";
import companyRoutes from "@/api/routes/company.routes";
import adminRoutes from "@/api/routes/admin.routes";
import productRoutes from "@/api/routes/product.routes";
import categoryRoutes from "@/api/routes/category.routes";
import kycRoutes from "@/api/routes/kyc.routes";
import customerManagementRoutes from "@/api/routes/customer-management.routes";
import internalNotificationRoutes from "@/api/routes/internal_notification";
import installmentRoutes from "@/api/routes/installment.routes";
import commissionRoutes from "@/api/routes/comission.routes";

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
router.use("/company", companyRoutes);
router.use("/admin", adminRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/kyc", kycRoutes);
router.use("/customers", customerManagementRoutes);
router.use("/notifications", internalNotificationRoutes);
router.use("/installments", installmentRoutes);
router.use("/commissions", commissionRoutes);

export default router;
