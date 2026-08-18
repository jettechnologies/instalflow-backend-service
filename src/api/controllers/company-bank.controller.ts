import type { Request, Response, NextFunction } from "express";

import ApiResponse from "@/shared/utils/ApiResponse";
import { CompanyBankAccountService } from "@/core/services/company-bank.service";
import {
  AddBankAccountSchema,
  SwitchPrimaryBankAccountSchema,
  RemoveBankAccountSchema,
} from "@/shared/schemas/bank.schema";

export class CompanyBankController {
  static async addBankAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.user!.companyId!;
      const payload = AddBankAccountSchema.parse(req.body);

      const account = await CompanyBankAccountService.addBankAccount(
        companyId,
        payload,
      );

      return ApiResponse.success(
        res,
        201,
        "Company bank account added successfully",
        account,
      );
    } catch (error) {
      next(error);
    }
  }

  static async listBankAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.user!.companyId!;

      const accounts = await CompanyBankAccountService.listBankAccounts(
        companyId,
      );

      return ApiResponse.success(
        res,
        200,
        "Company bank accounts retrieved successfully",
        accounts,
      );
    } catch (error) {
      next(error);
    }
  }

  static async switchPrimaryBankAccount(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const companyId = req.user!.companyId!;
      const payload = SwitchPrimaryBankAccountSchema.parse(req.body);

      const result = await CompanyBankAccountService.switchPrimaryBankAccount(
        companyId,
        payload.accountId,
      );

      return ApiResponse.success(
        res,
        200,
        result.message || "Primary bank account updated successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async removeBankAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.user!.companyId!;
      const payload = RemoveBankAccountSchema.parse(req.body);

      const result = await CompanyBankAccountService.removeBankAccount(
        companyId,
        payload.accountId,
      );

      return ApiResponse.success(
        res,
        200,
        "Company bank account removed successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }
}
