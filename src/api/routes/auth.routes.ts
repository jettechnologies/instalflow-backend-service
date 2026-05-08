import { Router } from "express";
import { AuthController } from "@/api/controllers/auth.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import {
  loginLimiter,
  registerLimiter,
  otpLimiter,
} from "@/api/middlewares/rateLimiter";

const router = Router();

// Public routes
router.post("/register", registerLimiter, AuthController.register);
router.post(
  "/start-onboarding",
  registerLimiter,
  AuthController.startOnboarding,
);
router.post("/login", loginLimiter, AuthController.login);
router.post("/refresh", AuthController.refresh);
router.post("/forgot-password", otpLimiter, AuthController.forgotPassword);
router.post("/reset-password", otpLimiter, AuthController.resetPassword);

// Protected routes (require valid access token)
router.post("/logout", requireAuth, AuthController.logout);
router.post("/change-password", requireAuth, AuthController.changePassword);

// Business specific Creation
router.post(
  "/marketers",
  requireAuth,
  requireRole(["COMPANY", "ADMIN", "SUPER_ADMIN"]),
  AuthController.createMarketer,
);

export default router;
