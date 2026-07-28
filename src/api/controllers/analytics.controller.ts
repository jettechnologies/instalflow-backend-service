import { Request, Response, NextFunction } from "express";
import { AnalyticsService } from "@/core/services/analytics.service";
import { Role } from "@/infrastructure/prisma";
import ApiResponse from "@/shared/utils/ApiResponse";

export class AnalyticsController {
  static async getCompanyOverview(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const companyId = req.user!.companyId;
      if (!companyId) {
        return ApiResponse.badRequest(res, "Company ID not found in token.");
      }

      const data = await AnalyticsService.getCompanyOverview(companyId);
      return ApiResponse.success(
        res,
        200,
        "Company overview fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getAdminOverview(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const adminId = req.user!.userId;
      const data = await AnalyticsService.getAdminOverview(adminId);
      return ApiResponse.success(
        res,
        200,
        "Admin overview fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getMarketerOverview(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const marketerId = req.user!.userId;
      const data = await AnalyticsService.getMarketerOverview(marketerId);
      return ApiResponse.success(
        res,
        200,
        "Marketer overview fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerOverview(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const customerId = req.user!.userId;
      const data = await AnalyticsService.getCustomerOverview(customerId);
      return ApiResponse.success(
        res,
        200,
        "Customer dashboard fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getFinancingStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userRole = req.user!.role;
      const userId = req.user!.userId;
      const companyId = req.user!.companyId;

      let scope: any = {};
      if (userRole === Role.COMPANY && companyId) {
        scope.companyId = companyId;
      } else if (userRole === Role.ADMIN) {
        scope.adminId = userId;
      } else if (userRole === Role.MARKETER) {
        scope.marketerId = userId;
      } else if (userRole === Role.CUSTOMER) {
        scope.customerId = userId;
      } else {
        return ApiResponse.forbidden(res, "Insufficient privileges.");
      }

      const data = await AnalyticsService.getFinancingStats(scope);
      return ApiResponse.success(
        res,
        200,
        "Financing stats fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getKycFunnelStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userRole = req.user!.role;
      const userId = req.user!.userId;
      const companyId = req.user!.companyId;

      let scope: any = {};
      if (userRole === Role.COMPANY && companyId) {
        scope.companyId = companyId;
      } else if (userRole === Role.ADMIN) {
        scope.adminId = userId;
      } else if (userRole === Role.MARKETER) {
        scope.marketerId = userId;
      } else {
        return ApiResponse.forbidden(res, "Insufficient privileges.");
      }

      const data = await AnalyticsService.getKycFunnelStats(scope);
      return ApiResponse.success(
        res,
        200,
        "KYC funnel stats fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getCollectionStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const companyId = req.user!.companyId;
      if (!companyId) {
        return ApiResponse.forbidden(
          res,
          "Company ID required for collection stats.",
        );
      }
      const data = await AnalyticsService.getCollectionStats(companyId);
      return ApiResponse.success(
        res,
        200,
        "Collection stats fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getProductPerformance(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;
      const userId = req.user!.userId;

      let scope: any = {};
      if (userRole === Role.COMPANY && companyId) {
        scope.companyId = companyId;
      } else if (userRole === Role.ADMIN) {
        scope.adminId = userId;
      } else {
        return ApiResponse.forbidden(res, "Insufficient privileges.");
      }

      const data = await AnalyticsService.getProductPerformance(scope);
      return ApiResponse.success(
        res,
        200,
        "Product performance fetched successfully.",
        data,
      );
    } catch (error) {
      next(error);
    }
  }
}
