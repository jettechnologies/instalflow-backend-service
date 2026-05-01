import { Router } from "express";
import { SuperAdminController } from "../controllers/superadmin.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.guard.js";

const router = Router();

// All routes here require SuperAdmin privileges
router.use(requireAuth, requireRole(["SUPER_ADMIN"]));

router.get("/plans", SuperAdminController.getPlans);
router.post("/plans", SuperAdminController.createPlan);
router.patch("/plans/:planId", SuperAdminController.updatePlan);
router.patch("/plans/:planId/toggle", SuperAdminController.toggleStatus);
router.delete("/plans/:planId", SuperAdminController.deletePlan);

export default router;
