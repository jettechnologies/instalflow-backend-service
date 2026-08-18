import type { Request, Response, NextFunction } from "express";
import { type Role } from "@/infrastructure/prisma";

import ApiResponse from "@/shared/utils/ApiResponse";
import { MerchantSettlementService } from "@/core/services/merchant-settlement.service";

// Read-only for COMPANY/ADMIN by design — settlement is fully automatic, so
// there is no "request"/"approve"/"initiate" endpoint here for COMPANY. See
// DOMAIN_MODEL.md "Merchant Settlement".
export class MerchantSettlementController {
  static async listSettlements(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { userId, role } = req.user!;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await MerchantSettlementService.listSettlements({
        userId,
        role: role as Role,
        page,
        limit,
      });

      return ApiResponse.success(
        res,
        200,
        "Merchant settlements retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getSettlementById(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { userId, role } = req.user!;
      const settlementId = req.params.id as string;

      const result = await MerchantSettlementService.getSettlementById(
        settlementId,
        userId,
        role as Role,
      );

      return ApiResponse.success(
        res,
        200,
        "Merchant settlement retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getAuditTrail(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, role } = req.user!;
      const settlementId = req.params.id as string;

      const result = await MerchantSettlementService.getAuditTrail(
        settlementId,
        userId,
        role as Role,
      );

      return ApiResponse.success(
        res,
        200,
        "Settlement audit trail retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async retryTransfer(req: Request, res: Response, next: NextFunction) {
    try {
      const superAdminUserId = req.user!.userId;
      const settlementId = req.params.id as string;

      const result = await MerchantSettlementService.retryTransfer(
        settlementId,
        superAdminUserId,
      );

      return ApiResponse.success(
        res,
        200,
        "Settlement transfer retry initiated",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const result =
        await MerchantSettlementService.generatePendingSettlements();

      return ApiResponse.success(
        res,
        200,
        `Generated ${result.length} settlement(s)`,
        result,
      );
    } catch (error) {
      next(error);
    }
  }
}
