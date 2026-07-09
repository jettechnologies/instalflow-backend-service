import {
  AccountType,
  CommissionAllocationStatus,
  CommissionPayoutStatus,
  Prisma,
  prisma,
} from "@/infrastructure/prisma";
import logger from "@/infrastructure/logger/logger";
import { SubscriptionService } from "@/core/services/subscription.service";
import { PaymentIntentService } from "@/core/services/payment-intent.service";
import { onboardingQueue } from "@/infrastructure/queues/onboarding.queue";
import { paymentQueue } from "@/infrastructure/queues/payment.queue";
import { MetadataType } from "@/shared/utils/helpers/misc";
import { LedgerService } from "@/core/services/ledger.service";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";
import {
  derivePostPaymentStatus,
  deriveReservationStatus,
} from "@/shared/utils/helpers/commission-helper";

export class WebhookProcessor {
  static async handleChargeSuccess(data: any): Promise<void> {
    const reference = data.reference;
    const metadataType =
      typeof data.metadata?.type === "string"
        ? data.metadata.type.trim().toLowerCase()
        : null;

    logger.info("[webhook] metadata inspection", {
      raw_metadata: data.metadata,
      metadata_type: data.metadata?.type,
      normalized_type: metadataType,
      metadata_type_typeof: typeof data.metadata?.type,
    });

    logger.webhook.paystack.chargeSuccess(reference, metadataType, {
      intent_id: data.metadata?.intentId,
    });

    switch (metadataType) {
      case MetadataType.onboarding_payment: {
        const intent = await prisma.onboardingIntent.findFirst({
          where: { paymentReference: reference },
        });

        if (!intent) {
          logger.error("No intent found for reference", { reference });
          return;
        }

        if (intent.status === "COMPLETED") return;

        await prisma.onboardingIntent.update({
          where: { id: intent.id },
          data: { status: "PAID" },
        });

        await onboardingQueue.add(
          "process-onboarding",
          { intentId: intent.intentId, reference },
          {
            jobId: intent.intentId,
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        logger.webhook.paystack.onboardingQueued(intent.intentId, reference);
        return;
      }

      case MetadataType.installment_payment: {
        const webhookInstallmentId = data.metadata?.installmentId;
        if (!webhookInstallmentId) {
          logger.error("No installmentId found in webhook metadata", {
            reference,
          });
          return;
        }

        const intent = await PaymentIntentService.findByReference(reference);

        if (!intent) {
          logger.error(
            "[webhook] No PaymentIntent found for reference — refusing to enqueue",
            { reference },
          );
          return;
        }

        if (intent.installmentId !== webhookInstallmentId) {
          logger.error(
            "[webhook] installmentId mismatch between webhook metadata and PaymentIntent — refusing to enqueue",
            {
              reference,
              webhookInstallmentId,
              intentInstallmentId: intent.installmentId,
            },
          );
          return;
        }

        const expectedAmountKobo = Number(intent.amount) * 100;
        if (expectedAmountKobo !== data.amount) {
          logger.error(
            "[webhook] amount mismatch between webhook payload and PaymentIntent — refusing to enqueue",
            {
              reference,
              webhookAmountKobo: data.amount,
              expectedAmountKobo,
            },
          );
          return;
        }

        await PaymentIntentService.markProcessing(intent.intentId);

        await paymentQueue.add(
          "process-payment",
          { installmentId: intent.installmentId, reference },
          {
            jobId: reference,
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        logger.info(
          `[webhook] → paymentQueue  installmentId=${intent.installmentId} reference=${reference}`,
        );
        return;
      }

      case MetadataType.company_subscription:
        logger.webhook.paystack.subscriptionFallback(reference);
        await SubscriptionService.verifySubscription(reference);
        return;

      default:
        logger.warn("[webhook] Unknown metadata type", {
          reference,
          metadata: data.metadata,
          metadataType,
        });
        return;
    }
  }

  static async handleTransferSuccess(data: any): Promise<void> {
    const payoutId = data.reference as string;
    const transferCode = data.transfer_code as string;

    logger.info("[webhook] transfer.success", { payoutId, transferCode });

    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: { payoutId },
      include: {
        user: true,
        commissionAllocations: { include: { commission: true } },
        marketerBankAccount: true,
      },
    });

    if (!payout) {
      logger.error("[webhook] transfer.success — payout not found", {
        payoutId,
      });
      return;
    }

    if (payout.status === CommissionPayoutStatus.PAID) {
      logger.info("[webhook] transfer.success — already PAID, skipping", {
        payoutId,
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.commissionPayoutRequest.update({
        where: { payoutId },
        data: {
          status: CommissionPayoutStatus.PAID,
          paidAt: new Date(),
          transferCompletedAt: new Date(),
        },
      });

      for (const allocation of payout.commissionAllocations) {
        if (allocation.status !== CommissionAllocationStatus.RESERVED) continue;

        await tx.commissionAllocation.update({
          where: { allocationId: allocation.allocationId },
          data: { status: CommissionAllocationStatus.PAID },
        });

        const newReservedAmount = allocation.commission.reservedAmount.minus(
          allocation.allocatedAmount,
        );

        const paidAggregate = await tx.commissionAllocation.aggregate({
          where: {
            commissionId: allocation.commissionId,
            status: CommissionAllocationStatus.PAID,
          },
          _sum: { allocatedAmount: true },
        });
        const totalPaid =
          paidAggregate._sum.allocatedAmount ?? new Prisma.Decimal(0);

        await tx.commission.update({
          where: { commissionId: allocation.commissionId },
          data: {
            reservedAmount: newReservedAmount,
            status: derivePostPaymentStatus(
              allocation.commission.amount,
              newReservedAmount,
              totalPaid,
            ),
          },
        });
      }

      await LedgerService.recordTransaction(
        {
          reference: `TRANSFER_SUCCESS_${payoutId}`,
          description: `Transfer confirmed for marketer ${payout.userId}`,
          companyId: payout.companyId,
          metadata: { payoutId, transferCode },
          entries: [
            {
              accountName: "PAYOUTS_IN_TRANSIT",
              accountType: AccountType.ASSET,
              debit: payout.amount,
            },
            {
              accountName: "BANK_SETTLED",
              accountType: AccountType.ASSET,
              credit: payout.amount,
            },
          ],
        },
        tx,
      );
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: payout.companyId, role: "COMPANY" },
      select: { email: true },
    });

    const maskedAccount =
      payout.marketerBankAccount?.accountNumber
        ?.slice(-4)
        .padStart(payout.marketerBankAccount.accountNumber.length, "*") ??
      "****";

    emitEvent(DomainEvent.COMMISSION_TRANSFER_SUCCESS, {
      marketerEmail: payout.user.email,
      marketerName: payout.user.name ?? "Marketer",
      marketerId: payout.userId,
      amount: Number(payout.amount),
      payoutId,
      transferCode,
      bankName: payout.marketerBankAccount?.bankName ?? "Bank",
      maskedAccount,
      companyId: payout.companyId,
      companyEmails: companyUsers.map((u) => u.email),
      dashboard_url: process.env.FRONTEND_URL,
    });

    logger.info("[webhook] transfer.success — PAID", { payoutId });
  }

  static async handleTransferFailed(data: any): Promise<void> {
    const payoutId = data.reference as string;
    const failReason =
      (data.failures?.[0]?.reason as string) ?? "Transfer failed";

    logger.warn("[webhook] transfer.failed", { payoutId, failReason });

    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: { payoutId },
      include: {
        user: true,
        commissionAllocations: { include: { commission: true } },
      },
    });

    if (!payout) {
      logger.error("[webhook] transfer.failed — payout not found", {
        payoutId,
      });
      return;
    }

    if (payout.status === CommissionPayoutStatus.TRANSFER_FAILED) return;

    await prisma.$transaction(async (tx) => {
      await tx.commissionPayoutRequest.update({
        where: { payoutId },
        data: {
          status: CommissionPayoutStatus.TRANSFER_FAILED,
          transferFailedAt: new Date(),
          transferFailReason: failReason,
        },
      });

      for (const allocation of payout.commissionAllocations) {
        if (allocation.status !== CommissionAllocationStatus.RESERVED) continue;

        await tx.commissionAllocation.update({
          where: { allocationId: allocation.allocationId },
          data: { status: CommissionAllocationStatus.RELEASED },
        });

        const newReservedAmount = allocation.commission.reservedAmount.minus(
          allocation.allocatedAmount,
        );

        await tx.commission.update({
          where: { commissionId: allocation.commissionId },
          data: {
            reservedAmount: newReservedAmount,
            status: deriveReservationStatus(
              newReservedAmount,
              allocation.commission.amount,
            ),
          },
        });
      }

      await LedgerService.recordTransaction(
        {
          reference: `TRANSFER_FAILED_${payoutId}`,
          description: `Transfer failed — restoring commission liability for ${payout.userId}`,
          companyId: payout.companyId,
          metadata: { payoutId, reason: failReason },
          entries: [
            {
              accountName: "PAYOUTS_IN_TRANSIT",
              accountType: AccountType.ASSET,
              debit: payout.amount,
            },
            {
              accountName: "COMMISSION_PAYABLE",
              accountType: AccountType.LIABILITY,
              credit: payout.amount,
            },
          ],
        },
        tx,
      );
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: payout.companyId, role: "COMPANY" },
      select: { email: true },
    });

    emitEvent(DomainEvent.COMMISSION_TRANSFER_FAILED, {
      marketerEmail: payout.user.email,
      marketerName: payout.user.name ?? "Marketer",
      marketerId: payout.userId,
      amount: Number(payout.amount),
      payoutId,
      reason: failReason,
      companyId: payout.companyId,
      companyEmails: companyUsers.map((u) => u.email),
      dashboard_url: process.env.FRONTEND_URL,
    });

    logger.warn("[webhook] transfer.failed — commissions released", {
      payoutId,
    });
  }

  static async handleTransferReversed(data: any): Promise<void> {
    const payoutId = data.reference as string;

    logger.warn("[webhook] transfer.reversed", { payoutId });

    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: { payoutId },
      include: {
        user: true,
        commissionAllocations: { include: { commission: true } },
      },
    });

    if (!payout) {
      logger.error("[webhook] transfer.reversed — payout not found", {
        payoutId,
      });
      return;
    }

    if (payout.status === CommissionPayoutStatus.TRANSFER_REVERSED) return;

    await prisma.$transaction(async (tx) => {
      await tx.commissionPayoutRequest.update({
        where: { payoutId },
        data: {
          status: CommissionPayoutStatus.TRANSFER_REVERSED,
          transferFailedAt: new Date(),
          transferFailReason: "Transfer reversed by Paystack",
        },
      });

      for (const allocation of payout.commissionAllocations) {
        if (allocation.status !== CommissionAllocationStatus.PAID) continue;

        await tx.commissionAllocation.update({
          where: { allocationId: allocation.allocationId },
          data: { status: CommissionAllocationStatus.RESERVED },
        });

        const newReservedAmount = allocation.commission.reservedAmount.plus(
          allocation.allocatedAmount,
        );

        await tx.commission.update({
          where: { commissionId: allocation.commissionId },
          data: {
            reservedAmount: newReservedAmount,
            status: deriveReservationStatus(
              newReservedAmount,
              allocation.commission.amount,
            ),
          },
        });
      }

      await LedgerService.recordTransaction(
        {
          reference: `TRANSFER_REVERSED_${payoutId}`,
          description: `Transfer reversed — commission liability restored for ${payout.userId}`,
          companyId: payout.companyId,
          metadata: { payoutId },
          entries: [
            {
              accountName: "BANK_SETTLED",
              accountType: AccountType.ASSET,
              debit: payout.amount,
            },
            {
              accountName: "COMMISSION_PAYABLE",
              accountType: AccountType.LIABILITY,
              credit: payout.amount,
            },
          ],
        },
        tx,
      );
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: payout.companyId, role: "COMPANY" },
      select: { email: true },
    });

    emitEvent(DomainEvent.COMMISSION_TRANSFER_REVERSED, {
      marketerEmail: payout.user.email,
      marketerName: payout.user.name ?? "Marketer",
      marketerId: payout.userId,
      amount: Number(payout.amount),
      payoutId,
      companyId: payout.companyId,
      companyEmails: companyUsers.map((u) => u.email),
      dashboard_url: process.env.FRONTEND_URL,
    });

    logger.warn("[webhook] transfer.reversed — reservations restored", {
      payoutId,
    });
  }
}
