import { Request, Response, NextFunction } from "express";

import { CommissionService } from "@/core/services/commission.service";

export class CommissionController {
  static async allTime(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const result = await CommissionService.getAllTimeCommissions(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async perCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const result = await CommissionService.getCommissionPerCustomer(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async perProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const result = await CommissionService.getCommissionPerProduct(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async requestPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const { amount } = req.body;

      const result = await CommissionService.requestPayout(userId, amount);

      res.status(201).json(result);
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

      res.status(200).json(result);
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

      res.status(200).json(result);
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

      res.status(200).json({
        success: true,
        message: "Transfer queued successfully",
        payload: result,
      });
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

      res.status(200).json({
        success: true,
        message: "Bulk transfer processing started",
        payload: result,
      });
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

      res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPayoutById(req: Request, res: Response, next: NextFunction) {
    try {
      const payoutId = req.params.id as string;

      const result = await CommissionService.getPayoutById(payoutId);

      res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
