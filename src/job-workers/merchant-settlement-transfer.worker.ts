import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";

import {
  prisma,
  AccountType,
  MerchantSettlementStatus,
  SettlementAuditActor,
} from "@/infrastructure/prisma";

import { LedgerService } from "@/core/services/ledger.service";
import { PaystackService } from "@/core/services/paystack.service";
import { QueueNames } from "@/infrastructure/redis/constant";

import type { MerchantSettlementTransferJobData } from "@/infrastructure/queues/merchant-settlement-transfer.queue";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";
import logger from "@/infrastructure/logger/logger";

// Mirrors transfer.worker.ts (commission payouts) exactly. This worker only
// calls Paystack and records that the call was made — it never marks a
// settlement as successfully completed. That final authority belongs
// entirely to the verified Paystack webhook (see webhook-processor.service.ts).
export const merchantSettlementTransferWorker =
  new Worker<MerchantSettlementTransferJobData>(
    QueueNames.MerchantSettlementTransferQueue,

    async (job) => {
      const { settlementId } = job.data;

      logger.info(
        `[settlement-transfer-worker] Processing settlementId=${settlementId}`,
      );

      const settlement = await prisma.merchantSettlementRequest.findUnique({
        where: { settlementId },
        include: { companyBankAccount: true },
      });

      if (!settlement) {
        throw new Error(
          `[settlement-transfer-worker] Settlement not found: ${settlementId}`,
        );
      }

      // Idempotency guard — only process TRANSFER_INITIATED settlements.
      if (settlement.status !== MerchantSettlementStatus.TRANSFER_INITIATED) {
        logger.warn(
          `[settlement-transfer-worker] Settlement ${settlementId} has status ${settlement.status} — skipping`,
        );
        return { skipped: true };
      }

      if (!settlement.companyBankAccount) {
        logger.error(
          `[settlement-transfer-worker] No bank account linked to settlement ${settlementId}`,
        );
        throw new Error(
          `[settlement-transfer-worker] No bank account linked to settlement ${settlementId}`,
        );
      }

      const bank = settlement.companyBankAccount;

      let recipientCode = bank.recipientCode;

      if (!recipientCode) {
        const result = await PaystackService.createTransferRecipient({
          name: bank.accountName,
          accountNumber: bank.accountNumber,
          bankCode: bank.bankCode,
        });

        recipientCode = result.recipientCode;

        await prisma.companyBankAccount.update({
          where: { accountId: bank.accountId },
          data: { recipientCode },
        });
      }

      const amountKobo = Number(settlement.amount) * 100;

      if (settlement.transferCode) {
        logger.info(
          `[settlement-transfer-worker] Settlement ${settlementId} already has transferCode=${settlement.transferCode} — skipping Paystack call`,
        );
      } else {
        // MST- prefix disambiguates this reference from commission payout
        // references in the shared transfer.success/failed/reversed webhook.
        const { transferCode } = await PaystackService.initiateTransfer({
          amountKobo,
          recipientCode,
          reference: `MST-${settlement.settlementId}`,
          reason: `Merchant settlement — company ${settlement.companyId}`,
        });

        await prisma.$transaction(async (tx) => {
          await tx.merchantSettlementRequest.update({
            where: { settlementId },
            data: { transferCode, transferCodeReceivedAt: new Date() },
          });

          await tx.merchantSettlementAuditTrail.create({
            data: {
              settlementId,
              action: "TRANSFER_INITIATED",
              actorType: SettlementAuditActor.WORKER,
              outcome: "SUCCESS",
              details: `Paystack transfer initiated, transferCode=${transferCode}.`,
            },
          });

          await LedgerService.recordTransaction(
            {
              reference: `SETTLEMENT_TRANSFER_INIT_${settlementId}`,
              description: `Settlement transfer initiated for company ${settlement.companyId}`,
              companyId: settlement.companyId,
              metadata: { settlementId, transferCode },
              entries: [
                {
                  accountName: "MERCHANT_PAYABLE",
                  accountType: AccountType.LIABILITY,
                  debit: settlement.amount,
                },
                {
                  accountName: "PAYOUTS_IN_TRANSIT",
                  accountType: AccountType.ASSET,
                  credit: settlement.amount,
                },
              ],
            },
            tx,
          );
        });

        logger.info(
          `[settlement-transfer-worker] SUCCESS settlementId=${settlementId} transferCode=${transferCode}`,
        );
      }

      return { success: true, transferCode: settlement.transferCode };
    },

    {
      connection: redis,
      concurrency: 2,
      limiter: { max: 10, duration: 1_000 },
    },
  );

merchantSettlementTransferWorker.on("completed", (job) => {
  console.log(`✅ Settlement transfer job completed: ${job.id}`);
});

merchantSettlementTransferWorker.on("failed", async (job, err) => {
  console.error(`❌ Settlement transfer job failed: ${job?.id}`, err);
  logger.error(`❌ Settlement transfer job failed: ${job?.id}`, err);

  if (
    job?.data?.settlementId &&
    job.attemptsMade >= (job.opts.attempts ?? 3)
  ) {
    const settlementId = job.data.settlementId;

    await prisma.merchantSettlementRequest.updateMany({
      where: { settlementId },
      data: {
        status: MerchantSettlementStatus.TRANSFER_FAILED,
        transferFailedAt: new Date(),
        transferFailReason: err.message,
      },
    });

    await prisma.merchantSettlementAuditTrail.create({
      data: {
        settlementId,
        action: "TRANSFER_FAILED",
        actorType: SettlementAuditActor.WORKER,
        outcome: "FAILURE",
        details: err.message,
      },
    });

    const settlement = await prisma.merchantSettlementRequest.findUnique({
      where: { settlementId },
    });

    if (settlement) {
      const companyUsers = await prisma.user.findMany({
        where: { companyId: settlement.companyId, role: "COMPANY" },
        select: { email: true },
      });

      emitEvent(DomainEvent.MERCHANT_SETTLEMENT_TRANSFER_FAILED, {
        companyId: settlement.companyId,
        companyEmails: companyUsers.map((u) => u.email),
        settlementId: settlement.settlementId,
        amount: Number(settlement.amount),
        reason: err.message,
        dashboard_url: process.env.FRONTEND_URL,
      });
    }
  }
});
