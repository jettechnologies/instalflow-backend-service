import type { Request, Response } from "express";
import { UserManagementService } from "@/core/services/user-management.service";
import ApiResponse from "@/shared/utils/ApiResponse";

export class AdminController {
  static async requestToggleMarketer(req: Request, res: Response) {
    const marketerId = req.params.id as string;

    const request = await UserManagementService.requestMarketerToggle(
      req.user!.userId!,
      req.user!.companyId!,
      marketerId,
    );

    return ApiResponse.success(
      res,
      201,
      "Toggle request submitted for approval",
      request,
    );
  }

  static async requestDeleteMarketer(req: Request, res: Response) {
    const marketerId = req.params.id as string;

    const request = await UserManagementService.requestMarketerDeletion(
      req.user!.userId!,
      req.user!.companyId!,
      marketerId,
    );

    return ApiResponse.success(
      res,
      201,
      "Delete request submitted for approval",
      request,
    );
  }

  static async getAdminMarketers(req: Request, res: Response) {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

    const result = await UserManagementService.getAdminMarketers({
      adminId: req.user!.userId!,
      companyId: req.user!.companyId!,
      page,
      limit,
      sortOrder,
    });

    return ApiResponse.success(
      res,
      200,
      "Marketers fetched successfully",
      result,
    );
  }

  static async getMarketerDetails(req: Request, res: Response) {
    const companyId = req.user!.companyId!;
    const adminId = req.user!.userId!;
    const marketerId = req.params.marketerId as string;

    const data = await UserManagementService.getMarketerDetails({
      companyId,
      adminId,
      marketerId,
    });

    return ApiResponse.success(
      res,
      200,
      "Marketer details retrieved successfully",
      data,
    );
  }
}
