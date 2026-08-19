import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PlatformRevenueService } from "@/core/services/platform-revenue.service";
import ApiResponse from "@/shared/utils/ApiResponse";

const LeaderboardQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const TenantLeaderboardQuery = LeaderboardQuery.extend({
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export class PlatformRevenueController {
  static async getTenantRevenue(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { companyId } = z.object({ companyId: z.uuid() }).parse(req.params);
      const data = await PlatformRevenueService.getTenantRevenue(companyId);
      return ApiResponse.success(res, 200, "Tenant revenue retrieved successfully", data);
    } catch (error) {
      next(error);
    }
  }

  static async getTenantLeaderboard(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const query = TenantLeaderboardQuery.parse(req.query);
      const data = await PlatformRevenueService.getTenantRevenueLeaderboard(query);
      return ApiResponse.success(res, 200, "Tenant revenue leaderboard retrieved successfully", data);
    } catch (error) {
      next(error);
    }
  }

  static async getProductLeaderboard(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const query = LeaderboardQuery.parse(req.query);
      const data = await PlatformRevenueService.getProductRevenueLeaderboard(query);
      return ApiResponse.success(res, 200, "Product revenue leaderboard retrieved successfully", data);
    } catch (error) {
      next(error);
    }
  }

  static async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PlatformRevenueService.getPlatformOverview();
      return ApiResponse.success(res, 200, "Platform overview retrieved successfully", data);
    } catch (error) {
      next(error);
    }
  }
}
