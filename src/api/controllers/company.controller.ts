import type { Request, Response } from "express";
import { UserManagementService } from "@/core/services/user-management.service";
import ApiResponse from "@/shared/utils/ApiResponse";
import {
  CreateAdminSchema,
  ToggleStatusSchema,
  HandleApprovalSchema,
} from "@/shared/schemas/user-management.schema";

export class CompanyController {
  static async createAdmin(req: Request, res: Response) {
    const payload = CreateAdminSchema.parse(req.body);
    const { user, tempPassword } = await UserManagementService.createAdmin(
      req.user!.companyId!,
      req.user!.userId!,
      payload
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
      payload
    );

    return ApiResponse.success(res, 200, "Admin status updated", updated);
  }

  static async deleteAdmin(req: Request, res: Response) {
    const adminId = req.params.id as string;

    const deleted = await UserManagementService.softDeleteAdmin(
      req.user!.companyId!,
      adminId
    );

    return ApiResponse.success(res, 200, "Admin deleted successfully", deleted);
  }

  static async getApprovals(req: Request, res: Response) {
    const approvals = await UserManagementService.getPendingApprovals(
      req.user!.companyId!
    );
    return ApiResponse.success(res, 200, "Pending approvals", approvals);
  }

  static async handleApproval(req: Request, res: Response) {
    const requestId = req.params.requestId as string;
    const payload = HandleApprovalSchema.parse(req.body);

    const result = await UserManagementService.handleApprovalRequest(
      req.user!.companyId!,
      requestId,
      payload
    );

    return ApiResponse.success(res, 200, result.message);
  }
}
