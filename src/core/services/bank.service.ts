import { prisma } from "@/infrastructure/prisma";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "@/shared/utils/AppError";
import { PaystackService } from "@/core/services/paystack.service";
import { AddBankAccountSchema } from "@/shared/schemas/bank.schema";
import z from "zod";

export class BankAccountService {
  static async addBankAccount(
    marketerId: string,
    data: z.infer<typeof AddBankAccountSchema>,
  ) {
    const existing = await prisma.marketerBankAccount.findFirst({
      where: { userId: marketerId, accountNumber: data.accountNumber },
    });

    if (existing) {
      throw new ConflictError("This account number is already registered");
    }

    const resolved = await PaystackService.resolveAccount({
      accountNumber: data.accountNumber,
      bankCode: data.bankCode,
    });

    if (data.isPrimary) {
      await prisma.marketerBankAccount.updateMany({
        where: { userId: marketerId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const account = await prisma.marketerBankAccount.create({
      data: {
        userId: marketerId,
        bankName: data.bankName,
        bankCode: data.bankCode,
        accountName: resolved.accountName,
        accountNumber: data.accountNumber,
        isPrimary: data.isPrimary,
        isVerified: true,
      },
    });

    return account;
  }

  static async listBankAccounts(marketerId: string) {
    return prisma.marketerBankAccount.findMany({
      where: { userId: marketerId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  }

  static async switchPrimaryBankAccount(marketerId: string, accountId: string) {
    const account = await prisma.marketerBankAccount.findUnique({
      where: { accountId },
    });

    if (!account || account.userId !== marketerId) {
      throw new NotFoundError("Bank account not found");
    }

    if (account.isPrimary) {
      return { success: true };
    }

    await prisma.$transaction(async (tx) => {
      await tx.marketerBankAccount.updateMany({
        where: {
          userId: marketerId,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });

      await tx.marketerBankAccount.update({
        where: {
          accountId,
        },
        data: {
          isPrimary: true,
        },
      });
    });

    return { success: true, message: "Bank account set as primary" };
  }

  static async removeBankAccount(marketerId: string, accountId: string) {
    const account = await prisma.marketerBankAccount.findUnique({
      where: { accountId },
    });

    if (!account || account.userId !== marketerId) {
      throw new NotFoundError("Bank account not found");
    }

    const activePayout = await prisma.commissionPayoutRequest.findFirst({
      where: {
        marketerBankAccountId: account.id,
        status: { in: ["TRANSFER_INITIATED"] },
      },
    });

    if (activePayout) {
      throw new BadRequestError(
        "Cannot remove a bank account with an active transfer in progress",
      );
    }

    await prisma.marketerBankAccount.delete({ where: { accountId } });

    return { success: true };
  }
}
