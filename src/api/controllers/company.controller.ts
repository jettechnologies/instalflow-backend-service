import type { Request, Response } from "express";
import { UserManagementService } from "@/core/services/user-management.service";
import ApiResponse from "@/shared/utils/ApiResponse";
import {
  CreateAdminSchema,
  ToggleStatusSchema,
  HandleApprovalSchema,
} from "@/shared/schemas/user-management.schema";

export class CompanyController {
  static async getAssociatedAdmins(req: Request, res: Response) {
    const companyId = req.user!.companyId!;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

    const data = await UserManagementService.getAssociatedAdmins({
      companyId,
      page,
      limit,
      sortOrder,
    });
    return ApiResponse.success(res, 200, "Admins retrieved successfully", data);
  }

  static async getAdminDetails(req: Request, res: Response) {
    const companyId = req.user!.companyId!;
    const adminId = req.params.adminId as string;

    const data = await UserManagementService.getAdminDetails(
      companyId,
      adminId,
    );

    return ApiResponse.success(
      res,
      200,
      "Admin details retrieved successfully",
      data,
    );
  }

  static async getAdminMarketers(req: Request, res: Response) {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const adminId = req.params.adminId as string;
    const companyId = req.user!.companyId!;

    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

    const result = await UserManagementService.getAdminMarketers({
      adminId,
      companyId,
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

  static async createAdmin(req: Request, res: Response) {
    const payload = CreateAdminSchema.parse(req.body);
    const { user, tempPassword } = await UserManagementService.createAdmin(
      req.user!.companyId!,
      req.user!.userId!,
      payload,
    );

    return ApiResponse.success(res, 201, "Admin created successfully", {
      user,
      tempPassword,
      instructions: "Please provide the temporary password to the admin.",
    });
  }

  static async toggleAdmin(req: Request, res: Response) {
    const adminId = req.params.id as string;
    const payload = ToggleStatusSchema.parse(req.body);

    const updated = await UserManagementService.toggleAdminStatus(
      req.user!.companyId!,
      adminId,
      payload,
    );

    return ApiResponse.success(res, 200, "Admin status updated", updated);
  }

  static async deleteAdmin(req: Request, res: Response) {
    const adminId = req.params.id as string;

    const deleted = await UserManagementService.softDeleteAdmin(
      req.user!.companyId!,
      adminId,
    );

    return ApiResponse.success(res, 200, "Admin deleted successfully", deleted);
  }

  static async getApprovals(req: Request, res: Response) {
    const approvals = await UserManagementService.getPendingApprovals(
      req.user!.companyId!,
    );
    return ApiResponse.success(res, 200, "Pending approvals", approvals);
  }

  static async handleApproval(req: Request, res: Response) {
    const requestId = req.params.requestId as string;
    const payload = HandleApprovalSchema.parse(req.body);

    const result = await UserManagementService.handleApprovalRequest(
      req.user!.companyId!,
      requestId,
      payload,
    );

    return ApiResponse.success(res, 200, result.message);
  }
}
