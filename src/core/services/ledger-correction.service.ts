import { Prisma, type AccountType } from "@/infrastructure/prisma";
import { LedgerService } from "@/core/services/ledger.service";
import { BadRequestError } from "@/shared/utils/AppError";
import { randomUUID } from "crypto";

/**
 * The one sanctioned way to post a manual correction outside auto-reconciliation
 * (PROJECT_WORKFLOW.md: "corrections are reversing entries, never edits/deletes").
 * Deliberately a thin wrapper — all the actual double-entry/balance/account-creation
 * logic stays in LedgerService.recordTransaction(), unchanged.
 */
export class LedgerCorrectionService {
  static async postManualCorrection(data: {
    performedById: string;
    reason: string;
    description: string;
    companyId?: string;
    entries: {
      accountName: string;
      accountType: AccountType;
      debit?: number;
      credit?: number;
    }[];
  }) {
    const totalDebits = data.entries.reduce(
      (acc, e) => acc.plus(new Prisma.Decimal(e.debit || 0)),
      new Prisma.Decimal(0),
    );
    const totalCredits = data.entries.reduce(
      (acc, e) => acc.plus(new Prisma.Decimal(e.credit || 0)),
      new Prisma.Decimal(0),
    );

    if (!totalDebits.equals(totalCredits)) {
      throw new BadRequestError(
        `Correction is not balanced: debits (${totalDebits}) must equal credits (${totalCredits}).`,
      );
    }

    const reference = `CORR-${randomUUID()}`;

    const transaction = await LedgerService.recordTransaction({
      reference,
      description: data.description,
      companyId: data.companyId,
      entries: data.entries,
      metadata: {
        type: "MANUAL_CORRECTION",
        reason: data.reason,
        performedById: data.performedById,
      },
    });

    return {
      reference,
      description: data.description,
      companyId: data.companyId ?? null,
      entries: data.entries,
      postedAt: transaction.createdAt,
    };
  }
}
