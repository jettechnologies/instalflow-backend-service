import type { Request, Response } from "express";
import { SuperAdminService } from "../services/superadmin.service.js";
import ApiResponse from "../libs/ApiResponse.js";

export class SuperAdminController {
  /**
   * Create a new subscription plan
   */
  static async createPlan(req: Request, res: Response) {
    const plan = await SuperAdminService.createSubscriptionPlan(req.body);
    return ApiResponse.success(res, 201, "Subscription plan created successfully", plan);
  }

  /**
   * Update an existing plan
   */
  static async updatePlan(req: Request, res: Response) {
    const { planId } = req.params;
    const plan = await SuperAdminService.updateSubscriptionPlan(planId, req.body);
    return ApiResponse.success(res, 200, "Subscription plan updated successfully", plan);
  }

  /**
   * List all plans (Internal/SuperAdmin view)
   */
  static async getPlans(req: Request, res: Response) {
    const plans = await SuperAdminService.getAllSubscriptionPlans();
    return ApiResponse.success(res, 200, "All subscription plans retrieved", plans);
  }

  /**
   * Delete a plan
   */
  static async deletePlan(req: Request, res: Response) {
    const { planId } = req.params;
    await SuperAdminService.deleteSubscriptionPlan(planId);
    return ApiResponse.success(res, 200, "Subscription plan deleted successfully");
  }
}
