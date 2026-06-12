import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";

import {
  prisma,
  Prisma,
  AccountType,
  CommissionStatus,
  CommissionPayoutStatus,
} from "@/infrastructure/prisma";

import { LedgerService } from "@/core/services/ledger.service";
import { PaystackService } from "@/core/services/paystack.service";
import { QueueNames } from "@/infrastructure/redis/constant";

import type { TransferJobData } from "@/infrastructure/queues/transfer.queue";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";

export const transferWorker = new Worker<TransferJobData>(
  QueueNames.TransferQueue,

  async (job) => {
    const { payoutId } = job.data;

    console.log(`[transfer-worker] Processing payoutId=${payoutId}`);

    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: { payoutId },
      include: {
        marketerBankAccount: true,
        company: {
          include: {
            users: {
              where: {
                role: {
                  in: ["COMPANY"],
                },
              },
            },
          },
        },
      },
    });

    if (!payout) {
      throw new Error(`[transfer-worker] Payout not found: ${payoutId}`);
    }

    // Guard: only process TRANSFER_INITIATED payouts (idempotency)
    if (payout.status !== CommissionPayoutStatus.TRANSFER_INITIATED) {
      console.warn(
        `[transfer-worker] Payout ${payoutId} has status ${payout.status} — skipping`,
      );
      return { skipped: true };
    }

    if (!payout.marketerBankAccount) {
      throw new Error(
        `[transfer-worker] No bank account linked to payout ${payoutId}`,
      );
    }

    const bank = payout.marketerBankAccount;

    let recipientCode = bank.recipientCode;

    if (!recipientCode) {
      const result = await PaystackService.createTransferRecipient({
        name: bank.accountName,
        accountNumber: bank.accountNumber,
        bankCode: bank.bankCode,
      });

      recipientCode = result.recipientCode;

      await prisma.marketerBankAccount.update({
        where: { accountId: bank.accountId },
        data: { recipientCode },
      });
    }

    const amountKobo = Number(payout.amount) * 100;

    const { transferCode } = await PaystackService.initiateTransfer({
      amountKobo,
      recipientCode,
      reference: payout.payoutId,
      reason: `Commission payout — ${payout.userId}`,
    });

    await prisma.$transaction(async (tx) => {
      await tx.commissionPayoutRequest.update({
        where: { payoutId },
        data: { transferCode },
      });

      await LedgerService.recordTransaction(
        {
          reference: `TRANSFER_INIT_${payoutId}`,
          description: `Transfer initiated for marketer ${payout.userId}`,
          companyId: payout.companyId,
          metadata: { payoutId, transferCode },
          entries: [
            {
              accountName: "COMMISSION_PAYABLE",
              accountType: AccountType.LIABILITY,
              debit: payout.amount,
            },
            {
              accountName: "PAYOUTS_IN_TRANSIT",
              accountType: AccountType.ASSET,
              credit: payout.amount,
            },
          ],
        },
        tx,
      );
    });

    console.log(
      `[transfer-worker] SUCCESS payoutId=${payoutId} transferCode=${transferCode}`,
    );

    return { success: true, transferCode };
  },

  {
    connection: redis,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 1_000,
    },
  },
);

transferWorker.on("completed", (job) => {
  console.log(`✅ Transfer job completed: ${job.id}`);
});

transferWorker.on("failed", async (job, err) => {
  console.error(`❌ Transfer job failed: ${job?.id}`, err);

  if (job?.data?.payoutId && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: { payoutId: job.data.payoutId },
      include: { user: true, company: { include: { users: true } } },
    });

    if (!payout) {
      throw new Error(
        `[transfer-worker] Payout not found: ${job.data.payoutId}`,
      );
    }

    await prisma.commissionPayoutRequest.updateMany({
      where: { payoutId: job.data.payoutId },
      data: {
        status: CommissionPayoutStatus.TRANSFER_FAILED,
        transferFailedAt: new Date(),
        transferFailReason: err.message,
      },
    });

    emitEvent(DomainEvent.COMMISSION_TRANSFER_FAILED, {
      marketerEmail: payout.user.email,
      marketerName: payout.user.name ?? "Marketer",
      marketerId: payout.userId,

      amount: Number(payout.amount),

      payoutId: payout.payoutId,

      reason: err.message,

      companyId: payout.companyId,

      companyEmails: payout.company.users.map((u) => u.email),

      dashboard_url: process.env.FRONTEND_URL,
    });
  }
});
