import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { requireAuth, requireRole } from "../middlewares/auth.guard";

const router = Router();

// Public routes
router.post("/register", AuthController.register);
router.post("/onboard-company", AuthController.onboardCompany); // Typically triggered after payment
router.post("/login", AuthController.login);
router.post("/refresh", AuthController.refresh);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);

// Protected routes (require valid access token)
router.post("/logout", requireAuth, AuthController.logout);
router.post("/change-password", requireAuth, AuthController.changePassword);

// Business specific Creation
router.post("/marketers", requireAuth, requireRole(["COMPANY", "ADMIN", "SUPER_ADMIN"]), AuthController.createMarketer);

export default router;
