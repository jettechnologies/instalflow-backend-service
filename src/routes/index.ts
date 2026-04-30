import { Router } from "express";
import authRoutes from "./auth.routes.js";
import subscriptionRoutes from "./subscription.routes.js";
import superadminRoutes from "./superadmin.routes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

router.use("/auth", authRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/superadmin", superadminRoutes);

export default router;
