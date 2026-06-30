// src/api/controllers/ledger-reconciliation.controller.ts

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import ApiResponse from "@/shared/utils/ApiResponse";
import { LedgerReconciliationService } from "@/core/services/ledger-reconciliation.service";

export class LedgerReconciliationController {
  /**
   * GET /superadmin/ledger/reconciliation/summary
   * Returns the summary of the latest reconciliation run from Redis cache.
   */
  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await LedgerReconciliationService.getSummary();
      return ApiResponse.success(
        res,
        200,
        result.cacheStatus === "cold"
          ? "Reconciliation cache is cold — no run recorded yet"
          : "Latest reconciliation summary retrieved",
        result,
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /superadmin/ledger/reconciliation/accounts
   * Returns all per-account reconciliation results with optional filters:
   *   ?discrepancyOnly=true
   *   ?companyId=<uuid>  or  ?companyId=global
   */
  static async getAllAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = z
        .object({
          discrepancyOnly: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => v === "true"),
          companyId: z.string().optional(),
        })
        .parse(req.query);

      const result = await LedgerReconciliationService.getAllAccountResults({
        discrepancyOnly: query.discrepancyOnly,
        companyId: query.companyId,
      });

      return ApiResponse.success(
        res,
        200,
        `${result.totalReturned} account(s) returned (cache: ${result.cacheStatus})`,
        result,
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /superadmin/ledger/reconciliation/accounts/:accountId
   * Returns the reconciliation result for a single ledger account.
   */
  static async getAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const { accountId } = z
        .object({ accountId: z.coerce.number().int().positive() })
        .parse(req.params);

      const result =
        await LedgerReconciliationService.getAccountResult(accountId);

      return ApiResponse.success(
        res,
        200,
        `Account reconciliation data retrieved (cache: ${result.cacheStatus})`,
        result,
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /superadmin/ledger/reconciliation/cache
   * Purges all reconciliation cache keys from Redis.
   * Use before triggering a manual re-run to prevent stale reads.
   */
  static async invalidateCache(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const result = await LedgerReconciliationService.invalidateCache();
      return ApiResponse.success(
        res,
        200,
        `Reconciliation cache invalidated — ${result.keysDeleted} key(s) deleted`,
        result,
      );
    } catch (err) {
      next(err);
    }
  }
}
