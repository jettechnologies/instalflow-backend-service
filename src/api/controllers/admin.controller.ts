import type { Request, Response } from "express";
import { UserManagementService } from "@/core/services/user-management.service";
import ApiResponse from "@/shared/utils/ApiResponse";

export class AdminController {
  static async requestToggleMarketer(req: Request, res: Response) {
    const marketerId = req.params.id as string;

    const request = await UserManagementService.requestMarketerToggle(
      req.user!.userId!,
      req.user!.companyId!,
      marketerId
    );

    return ApiResponse.success(res, 201, "Toggle request submitted for approval", request);
  }

  static async requestDeleteMarketer(req: Request, res: Response) {
    const marketerId = req.params.id as string;

    const request = await UserManagementService.requestMarketerDeletion(
      req.user!.userId!,
      req.user!.companyId!,
      marketerId
    );

    return ApiResponse.success(res, 201, "Delete request submitted for approval", request);
  }
}
