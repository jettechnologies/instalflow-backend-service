import { Request, Response, NextFunction } from "express";
import { CustomerManagementService } from "@/core/services/customer-management.service";
import { CustomerQuerySchema } from "@/shared/schemas/customer-management.schema";
import { Role } from "@/prisma/client";
import ApiResponse from "@/shared/utils/ApiResponse";

export class CustomerManagementController {
  static async listCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CustomerQuerySchema.parse(req.query);
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.listCustomers(
        reviewerId,
        reviewerRole,
        parsed,
      );

      return ApiResponse.success(
        res,
        200,
        "Customers fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerProducts(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const customerId = req.params.id as string;
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.getCustomerProducts(
        customerId,
        reviewerId,
        reviewerRole,
      );

      return ApiResponse.success(
        res,
        200,
        "Customer financed products fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getInstallmentSchedule(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const productId = req.params.productId as string;
      const customerId = req.params.id as string;
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.getInstallmentSchedule(
        customerId,
        productId,
        reviewerId,
        reviewerRole,
      );

      return ApiResponse.success(
        res,
        200,
        "Customer installment plan schedules and due dates fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerPaymentHistory(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const customerId = req.params.id as string;
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.getCustomerPaymentHistory(
        customerId,
        reviewerId,
        reviewerRole,
      );

      return ApiResponse.success(
        res,
        200,
        "Customer payment history ledger fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getCorporateHierarchy(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.getCorporateHierarchy(
        reviewerId,
        reviewerRole,
      );

      return ApiResponse.success(
        res,
        200,
        "Corporate hierarchical pipeline retrieved successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }
}
