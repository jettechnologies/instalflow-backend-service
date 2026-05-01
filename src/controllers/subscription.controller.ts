import type { Request, Response } from "express";
import { SubscriptionService } from "../services/subscription.service.js";
import ApiResponse from "../libs/ApiResponse.js";
import { InitializeSubscriptionSchema } from "../schema/subscription.schema.js";

export class SubscriptionController {
  /**
   * List available subscription plans
   */
  static async getPlans(req: Request, res: Response) {
    const plans = await SubscriptionService.getActivePlans();
    return ApiResponse.success(res, 200, "Active subscription plans retrieved", plans);
  }

  /**
   * Initialize a subscription payment via Paystack
   */
  static async initialize(req: Request, res: Response) {
    const { planId } = InitializeSubscriptionSchema.parse(req.body);
    const { companyId, email } = req.user!;

    if (!companyId) {
      return ApiResponse.forbidden(res, "Only company accounts can initialize subscriptions");
    }

    const data = await SubscriptionService.initializeSubscription(
      companyId,
      planId,
      email
    );

    return ApiResponse.success(res, 200, "Subscription initialized", data);
  }

  /**
   * Verify a subscription payment
   */
  static async verify(req: Request, res: Response) {
    const { reference } = req.query;

    if (!reference || typeof reference !== "string") {
      return ApiResponse.badRequest(res, "Payment reference is required");
    }

    const result = await SubscriptionService.verifySubscription(reference);
    return ApiResponse.success(res, 200, "Subscription verified and activated", result);
  }
}
