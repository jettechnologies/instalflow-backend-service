import { Router } from "express";
import { prisma } from "../../prisma/client.js";
import ApiResponse from "../libs/ApiResponse.js";

const router = Router();

/**
 * @swagger
 * /subscriptions/plans:
 *   get:
 *     summary: List all active subscription plans
 *     tags: [Subscription]
 *     responses:
 *       200:
 *         description: List of active plans
 */
router.get("/plans", async (req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: { price: "asc" },
  });
  return ApiResponse.success(res, 200, "Subscription plans retrieved", plans);
});

export default router;
