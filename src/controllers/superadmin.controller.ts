import type { Request, Response } from "express";
import { z } from "zod";
import { SuperAdminService } from "../services/superadmin.service.js";
import ApiResponse from "../libs/ApiResponse.js";
import {
  CreateSubscriptionPlanSchema,
  UpdateSubscriptionPlanSchema,
} from "../schema/subscription.schema.js";

export class SuperAdminController {
  /**
   * Create a new subscription plan
   */
  static async createPlan(req: Request, res: Response) {
    const validatedData = CreateSubscriptionPlanSchema.parse(req.body);
    const plan = await SuperAdminService.createSubscriptionPlan(validatedData);
    return ApiResponse.success(
      res,
      201,
      "Subscription plan created successfully",
      plan,
    );
  }

  /**
   * Update an existing plan
   */
  static async updatePlan(req: Request, res: Response) {
    const { planId } = z
      .object({ planId: z.string().uuid() })
      .parse(req.params);
    const validatedData = UpdateSubscriptionPlanSchema.parse(req.body);
    const plan = await SuperAdminService.updateSubscriptionPlan(
      planId,
      validatedData,
    );
    return ApiResponse.success(
      res,
      200,
      "Subscription plan updated successfully",
      plan,
    );
  }

  /**
   * List all plans (Internal/SuperAdmin view)
   */
  static async getPlans(req: Request, res: Response) {
    const plans = await SuperAdminService.getAllSubscriptionPlans();
    return ApiResponse.success(
      res,
      200,
      "All subscription plans retrieved",
      plans,
    );
  }

  /**
   * Toggle plan status (active/inactive)
   */
  static async toggleStatus(req: Request, res: Response) {
    const { planId } = z.object({ planId: z.uuid() }).parse(req.params);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const plan = await SuperAdminService.togglePlanStatus(planId, active);
    return ApiResponse.success(
      res,
      200,
      `Subscription plan ${active ? "activated" : "deactivated"} successfully`,
      plan,
    );
  }

  /**
   * Delete a plan
   */
  static async deletePlan(req: Request, res: Response) {
    const { planId } = z.object({ planId: z.uuid() }).parse(req.params);
    await SuperAdminService.deleteSubscriptionPlan(planId);
    return ApiResponse.success(
      res,
      200,
      "Subscription plan deleted successfully",
    );
  }
}
