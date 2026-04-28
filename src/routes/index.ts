import { Router } from "express";
import authRoutes from "./auth.routes";

const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

router.use("/auth", authRoutes);

export default router;
