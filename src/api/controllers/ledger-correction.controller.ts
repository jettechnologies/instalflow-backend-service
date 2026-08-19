import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AccountType } from "@/infrastructure/prisma";
import { LedgerCorrectionService } from "@/core/services/ledger-correction.service";
import ApiResponse from "@/shared/utils/ApiResponse";

const CorrectionEntrySchema = z
  .object({
    accountName: z.string().min(1),
    accountType: z.enum(AccountType),
    debit: z.coerce.number().min(0).optional(),
    credit: z.coerce.number().min(0).optional(),
  })
  .refine((e) => (e.debit ?? 0) > 0 || (e.credit ?? 0) > 0, {
    message: "Each entry must have a positive debit or credit.",
  });

const PostCorrectionSchema = z.object({
  description: z.string().min(5),
  reason: z
    .string()
    .min(10, "Reason must explain why this correction is necessary — it's a permanent, auditable ledger entry."),
  companyId: z.uuid().optional(),
  entries: z.array(CorrectionEntrySchema).min(2),
});

export class LedgerCorrectionController {
  static async postCorrection(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const payload = PostCorrectionSchema.parse(req.body);
      const performedById = req.user!.userId;

      const result = await LedgerCorrectionService.postManualCorrection({
        ...payload,
        performedById,
      });

      return ApiResponse.success(
        res,
        201,
        "Ledger correction posted successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }
}
