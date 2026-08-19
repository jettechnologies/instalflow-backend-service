import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { CompanyStatus } from "@/infrastructure/prisma";
import {
  TenantManagementService,
  ActivityType,
} from "@/core/services/tenant-management.service";
import ApiResponse from "@/shared/utils/ApiResponse";

const ListTenantsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

const SetTenantStatusSchema = z.object({
  status: z.enum(CompanyStatus),
  reason: z.string().min(10).optional(),
});

const ActivityQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(ActivityType).optional(),
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

  static async setTenantStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { companyId } = z.object({ companyId: z.uuid() }).parse(req.params);
      const payload = SetTenantStatusSchema.parse(req.body);
      const performedById = req.user!.userId;

      const data = await TenantManagementService.setTenantStatus(companyId, {
        ...payload,
        performedById,
      });

      return ApiResponse.success(
        res,
        200,
        `Tenant ${payload.status === CompanyStatus.SUSPENDED ? "suspended" : "reactivated"} successfully`,
        data,
      );
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
