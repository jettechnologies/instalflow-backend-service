import { Request, Response, NextFunction } from "express";
import { FinancingService } from "@/core/services/financing.service";
import ApiResponse from "@/shared/utils/ApiResponse";
import {
  RestructureContractSchema,
  WriteOffContractSchema,
} from "@/shared/schemas/financing.schema";

export class FinancingController {
  static async restructureContract(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const adminUserId = (req as any).user?.userId;
      if (!adminUserId) {
        throw new Error("Unauthorized");
      }

      const contractId = req.params.id as string;
      const data = RestructureContractSchema.parse(req.body);

      const result = await FinancingService.restructureContract(
        contractId,
        adminUserId,
        data,
      );

      return ApiResponse.success(
        res,
        200,
        "Contract restructured successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async writeOffContract(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const companyUserId = (req as any).user?.userId;
      if (!companyUserId) {
        throw new Error("Unauthorized");
      }

      const contractId = req.params.id as string;
      const data = WriteOffContractSchema.parse(req.body);

      const result = await FinancingService.writeOffContract(
        contractId,
        companyUserId,
        data.reason,
      );

      return ApiResponse.success(
        res,
        200,
        "Contract written off successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }
}
