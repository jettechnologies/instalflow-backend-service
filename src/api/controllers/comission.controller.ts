import { Request, Response, NextFunction } from "express";

import ApiResponse from "@/shared/utils/ApiResponse";
import { CommissionService } from "@/core/services/commission.service";

export class CommissionController {
  static async allTime(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const result = await CommissionService.getAllTimeCommissions(userId);

      return ApiResponse.success(
        res,
        200,
        "All-time commissions retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async perCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const result = await CommissionService.getCommissionPerCustomer(userId);

      return ApiResponse.success(
        res,
        200,
        "Commission per customer retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async perProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const result = await CommissionService.getCommissionPerProduct(userId);

      return ApiResponse.success(
        res,
        200,
        "Commission per product retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async requestPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const { amount } = req.body;

      const result = await CommissionService.requestPayout(userId, amount);

      return ApiResponse.success(
        res,
        201,
        "Payout request submitted successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async adminApprove(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = (req as any).user.userId;
      const payoutId = req.params.id as string;

      const result = await CommissionService.adminApprovePayout(
        payoutId,
        adminId,
      );

      return ApiResponse.success(
        res,
        200,
        "Payout approved by admin successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async companyApprove(req: Request, res: Response, next: NextFunction) {
    try {
      const companyUserId = (req as any).user.userId;
      const payoutId = req.params.id as string;

      const result = await CommissionService.companyApprovePayout(
        payoutId,
        companyUserId,
      );

      return ApiResponse.success(
        res,
        200,
        "Payout approved by company successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async initiateTransfer(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const companyUserId = (req as any).user.userId;
      const payoutId = req.params.id as string;

      const result = await CommissionService.initiateTransfer(
        payoutId,
        companyUserId,
      );

      return ApiResponse.success(
        res,
        200,
        "Transfer queued successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async initiateBulkTransfer(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const companyUserId = (req as any).user.userId;
      const { payoutIds } = req.body;

      const result = await CommissionService.initiateBulkTransfer(
        payoutIds,
        companyUserId,
      );

      return ApiResponse.success(
        res,
        200,
        "Bulk transfer processing started",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getPayoutRequests(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = (req as any).user.userId;
      const role = (req as any).user.role;

      const result = await CommissionService.getPayoutRequests(userId, role);

      return ApiResponse.success(
        res,
        200,
        "Payout requests retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getPayoutById(req: Request, res: Response, next: NextFunction) {
    try {
      const payoutId = req.params.id as string;

      const result = await CommissionService.getPayoutById(payoutId);

      return ApiResponse.success(
        res,
        200,
        "Payout retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }
}
