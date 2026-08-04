import { Request, Response, NextFunction } from "express";

import ApiResponse from "@/shared/utils/ApiResponse";
import { BankAccountService } from "@/core/services/bank.service";
import {
  AddBankAccountSchema,
  SwitchPrimaryBankAccountSchema,
  RemoveBankAccountSchema,
} from "@/shared/schemas/bank.schema";
import z from "zod";

export class BankController {
  static async addBankAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const marketerId = (req as any).user.userId;
      const payload = AddBankAccountSchema.parse(req.body);

      const account = await BankAccountService.addBankAccount(marketerId, payload);

      return ApiResponse.success(
        res,
        201,
        "Bank account added successfully",
        account,
      );
    } catch (error) {
      next(error);
    }
  }

  static async listBankAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const marketerId = (req as any).user.userId;

      const accounts = await BankAccountService.listBankAccounts(marketerId);

      return ApiResponse.success(
        res,
        200,
        "Bank accounts retrieved successfully",
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
      const marketerId = (req as any).user.userId;
      const payload = SwitchPrimaryBankAccountSchema.parse(req.body);

      const result = await BankAccountService.switchPrimaryBankAccount(
        marketerId,
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
      const marketerId = (req as any).user.userId;
      const payload = RemoveBankAccountSchema.parse(req.body);

      const result = await BankAccountService.removeBankAccount(
        marketerId,
        payload.accountId,
      );

      return ApiResponse.success(
        res,
        200,
        "Bank account removed successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }
}
