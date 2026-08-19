import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { TenantManagementService } from "@/core/services/tenant-management.service";
import ApiResponse from "@/shared/utils/ApiResponse";

const ListTenantsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

const ActivityQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z
    .enum(["kyc", "settlement", "approval", "payout", "contract", "login"])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export class TenantController {
  static async listTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ListTenantsQuery.parse(req.query);
      const data = await TenantManagementService.listTenants(query);
      return ApiResponse.success(res, 200, "Tenants retrieved successfully", data);
    } catch (error) {
      next(error);
    }
  }

  static async getTenantProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { companyId } = z.object({ companyId: z.uuid() }).parse(req.params);
      const data = await TenantManagementService.getTenantProfile(companyId);
      return ApiResponse.success(res, 200, "Tenant profile retrieved successfully", data);
    } catch (error) {
      next(error);
    }
  }

  static async getTenantActivity(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { companyId } = z.object({ companyId: z.uuid() }).parse(req.params);
      const query = ActivityQuery.parse(req.query);
      const data = await TenantManagementService.getTenantActivity(
        companyId,
        query,
      );
      return ApiResponse.success(res, 200, "Tenant activity retrieved successfully", data);
    } catch (error) {
      next(error);
    }
  }
}
