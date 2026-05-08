import { Router } from "express";
import { SuperAdminController } from "@/api/controllers/superadmin.controller";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";

const router = Router();

// All routes here require SuperAdmin privileges
router.use(requireAuth, requireRole(["SUPER_ADMIN"]));

router.get("/plans", SuperAdminController.getPlans);
router.post("/plans", SuperAdminController.createPlan);
router.patch("/plans/:planId", SuperAdminController.updatePlan);
router.patch("/plans/:planId/toggle", SuperAdminController.toggleStatus);
router.delete("/plans/:planId", SuperAdminController.deletePlan);

export default router;
