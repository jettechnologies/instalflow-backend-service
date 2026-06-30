import type { Request, Response } from "express";
import { InstallmentPlanService } from "@/core/services/installment-plan.service";
import {
  UpdateInstallmentPlanSchema,
  DeactivateInstallmentPlanSchema,
  CreateInstallmentPlanSchema,
} from "@/shared/schemas/installment-plan.schema";
import ApiResponse from "@/shared/utils/ApiResponse";

export class InstallmentPlanController {
  static async getInstallmentPlansByProduct(req: Request, res: Response) {
    const productId = req.params.productId as string;
    const plans = await InstallmentPlanService.getInstallmentPlansByProduct(productId);
    return ApiResponse.success(res, 200, "Installment plans retrieved successfully", plans);
  }

  static async updateInstallmentPlan(req: Request, res: Response) {
    const planId = req.params.planId as string;
    const payload = UpdateInstallmentPlanSchema.parse(req.body);
    const plan = await InstallmentPlanService.updateInstallmentPlan(planId, payload);
    return ApiResponse.success(res, 200, "Installment plan updated successfully", plan);
  }

  static async deactivateInstallmentPlan(req: Request, res: Response) {
    const planId = req.params.planId as string;
    const payload = DeactivateInstallmentPlanSchema.parse(req.body);
    const plan = await InstallmentPlanService.deactivateInstallmentPlan(planId, payload);
    return ApiResponse.success(res, 200, "Installment plan status updated successfully", plan);
  }

  static async createInstallmentPlan(req: Request, res: Response) {
    const productId = req.params.productId as string;
    const payload = CreateInstallmentPlanSchema.parse({
      ...req.body,
      productId,
    });
    const plan = await InstallmentPlanService.createInstallmentPlan(productId, payload);
    return ApiResponse.success(res, 201, "Installment plan created successfully", plan);
  }
}