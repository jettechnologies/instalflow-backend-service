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
    return ApiResponse.success(
      res,
      200,
      "Active subscription plans retrieved",
      plans,
    );
  }

  /**
   * Initialize a subscription payment via Paystack
   */
  static async initialize(req: Request, res: Response) {
    const { planId } = InitializeSubscriptionSchema.parse(req.body);
    const { companyId, email } = req.user!;

    if (!companyId) {
      return ApiResponse.forbidden(
        res,
        "Only company accounts can initialize subscriptions",
      );
    }

    const data = await SubscriptionService.initializeSubscription(
      companyId,
      planId,
      email,
    );

    return ApiResponse.success(res, 200, "Subscription initialized", data);
  }

  /**
   * Initialize an onboarding payment for a new company intent
   */
  static async initializeOnboarding(req: Request, res: Response) {
    // We expect intentId from the body
    const { intentId } = req.body;

    if (!intentId) {
      return ApiResponse.badRequest(res, "Onboarding Intent ID is required");
    }

    try {
      const data =
        await SubscriptionService.initializeOnboardingPayment(intentId);
      return ApiResponse.success(
        res,
        200,
        "Onboarding payment initialized",
        data,
      );
    } catch (error: any) {
      if (error.name === "NotFoundError") {
        return ApiResponse.notFound(res, error.message);
      }
      return ApiResponse.internalServerError(
        res,
        error.message || "Internal Server Error",
      );
    }
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
    return ApiResponse.success(
      res,
      200,
      "Subscription verified and activated",
      result,
    );
  }
}
