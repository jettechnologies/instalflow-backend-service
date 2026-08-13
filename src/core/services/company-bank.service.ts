import { prisma } from "@/infrastructure/prisma";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "@/shared/utils/AppError";
import { PaystackService } from "@/core/services/paystack.service";
import { AddBankAccountSchema } from "@/shared/schemas/bank.schema";
import z from "zod";

// Mirrors BankAccountService's shape 1:1, keyed by companyId instead of
// userId. This is account *management* only — adding/verifying a company
// bank account never moves money by itself; it only makes the company
// eligible for the next automatic settlement transfer pass (see
// MerchantSettlementService.queueEligibleTransfers).
export class CompanyBankAccountService {
  static async addBankAccount(
    companyId: string,
    data: z.infer<typeof AddBankAccountSchema>,
  ) {
    const existing = await prisma.companyBankAccount.findFirst({
      where: { companyId, accountNumber: data.accountNumber },
    });

    if (existing) {
      throw new ConflictError("This account number is already registered");
    }

    const resolved = await PaystackService.resolveAccount({
      accountNumber: data.accountNumber,
      bankCode: data.bankCode,
    });

    const account = await prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.companyBankAccount.updateMany({
          where: { companyId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.companyBankAccount.create({
        data: {
          companyId,
          bankName: data.bankName,
          bankCode: data.bankCode,
          accountName: resolved.accountName,
          accountNumber: data.accountNumber,
          isPrimary: data.isPrimary,
          isVerified: true,
        },
      });
    });

    return account;
  }

  static async listBankAccounts(companyId: string) {
    return prisma.companyBankAccount.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  }

  static async switchPrimaryBankAccount(companyId: string, accountId: string) {
    const account = await prisma.companyBankAccount.findUnique({
      where: { accountId },
    });

    if (!account || account.companyId !== companyId) {
      throw new NotFoundError("Bank account not found");
    }

    if (account.isPrimary) {
      return { success: true };
    }

    await prisma.$transaction(async (tx) => {
      await tx.companyBankAccount.updateMany({
        where: { companyId, isPrimary: true },
        data: { isPrimary: false },
      });

      await tx.companyBankAccount.update({
        where: { accountId },
        data: { isPrimary: true },
      });
    });

    return { success: true, message: "Bank account set as primary" };
  }

  static async removeBankAccount(companyId: string, accountId: string) {
    const account = await prisma.companyBankAccount.findUnique({
      where: { accountId },
    });

    if (!account || account.companyId !== companyId) {
      throw new NotFoundError("Bank account not found");
    }

    if (account.isPrimary) {
      throw new BadRequestError(
        "Cannot delete the primary bank account. Please set another account as primary first.",
      );
    }

    const activeSettlement = await prisma.merchantSettlementRequest.findFirst({
      where: {
        companyBankAccountId: account.id,
        status: { in: ["TRANSFER_INITIATED"] },
      },
    });

    if (activeSettlement) {
      throw new BadRequestError(
        "Cannot remove a bank account with an active settlement transfer in progress",
      );
    }

    await prisma.companyBankAccount.delete({ where: { accountId } });

    return { success: true };
  }
}
