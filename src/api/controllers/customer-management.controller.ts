import { Request, Response, NextFunction } from "express";
import { CustomerManagementService } from "@/core/services/customer-management.service";
import { CustomerQuerySchema } from "@/shared/schemas/customer-management.schema";
import { Role } from "@/prisma/client";

export class CustomerManagementController {
  static async listCustomers(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = CustomerQuerySchema.parse(req.query);
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.listCustomers(
        reviewerId,
        reviewerRole,
        parsed,
      );

      res.status(200).json({
        success: true,
        message: "Customers fetched successfully.",
        ...data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerProducts(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const customerId = req.params.id as string;
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.getCustomerProducts(
        customerId,
        reviewerId,
        reviewerRole,
      );

      res.status(200).json({
        success: true,
        message: "Customer financed products fetched successfully.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getInstallmentSchedule(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
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

      res.status(200).json({
        success: true,
        message:
          "Customer installment plan schedules and due dates fetched successfully.",
        ...data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerPaymentHistory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const customerId = req.params.id as string;
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.getCustomerPaymentHistory(
        customerId,
        reviewerId,
        reviewerRole,
      );

      res.status(200).json({
        success: true,
        message: "Customer payment history ledger fetched successfully.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getCorporateHierarchy(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role as Role;

      const data = await CustomerManagementService.getCorporateHierarchy(
        reviewerId,
        reviewerRole,
      );

      res.status(200).json({
        success: true,
        message: "Corporate hierarchical pipeline retrieved successfully.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
