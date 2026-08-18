import {
  AccountType,
  CommissionAllocationStatus,
  CommissionPayoutStatus,
  MerchantSettlementStatus,
  SettlementAuditActor,
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

// Prefix set by merchant-settlement-transfer.worker.ts on the Paystack
// transfer reference — lets the shared transfer.* webhooks below tell a
// settlement transfer apart from a commission payout transfer, since both
// use the same Paystack event types. Existing commissionPayoutRequest
// payoutIds are raw UUIDs and never carry this prefix.
const SETTLEMENT_REFERENCE_PREFIX = "MST-";

type WebhookPayload = Record<string, unknown>;

interface ChargeSuccessPayload {
  reference: string;
  amount: number;
  metadata: {
    type?: string;
    intentId?: string;
    installmentId?: string;
  };
}

interface TransferSuccessPayload {
  reference: string;
  transfer?: {
    id?: string;
    metadata?: Record<string, unknown>;
  };
}

interface TransferFailedPayload {
  reference: string;
  transfer?: {
    id?: string;
    metadata?: Record<string, unknown>;
  };
}

interface TransferReversedPayload {
  reference: string;
  transfer?: {
    id?: string;
    metadata?: Record<string, unknown>;
  };
}

export class WebhookProcessor {
  static async handleChargeSuccess(data: unknown): Promise<void> {
    const payload = data as ChargeSuccessPayload;
    const reference = payload.reference;
    const metadataType =
      typeof payload.metadata?.type === "string"
        ? (payload.metadata.type.trim().toLowerCase() as string)
        : null;

    logger.info("[webhook] metadata inspection", {
      raw_metadata: payload.metadata,
      metadata_type: payload.metadata?.type,
      normalized_type: metadataType,
      metadata_type_typeof: typeof payload.metadata?.type,
    });

    logger.webhook.paystack.chargeSuccess(reference, metadataType, {
      intent_id: payload.metadata?.intentId,
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
        const webhookInstallmentId = payload.metadata?.installmentId;
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
        if (expectedAmountKobo !== payload.amount) {
          logger.error(
            "[webhook] amount mismatch between webhook payload and PaymentIntent — refusing to enqueue",
            {
              reference,
              webhookAmountKobo: payload.amount,
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
          metadata: payload.metadata,
          metadataType,
        });
        return;
    }
  }

  static async handleTransferSuccess(data: unknown): Promise<void> {
    const payload = data as WebhookPayload;
    const reference = payload.reference as string;

    if (reference?.startsWith(SETTLEMENT_REFERENCE_PREFIX)) {
      return this.handleSettlementTransferSuccess(data);
    }

    const payoutId = reference;
    const transferCode = payload.transfer_code as string;

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

  static async handleTransferFailed(data: unknown): Promise<void> {
    const payload = data as WebhookPayload;
    const reference = payload.reference as string;

    if (reference?.startsWith(SETTLEMENT_REFERENCE_PREFIX)) {
      return this.handleSettlementTransferFailed(data);
    }

    const payoutId = reference;
    const failReason =
      ((payload.failures as unknown as Array<{ reason?: string }>)?.[0]?.reason as string) ??
      "Transfer failed";

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

  static async handleTransferReversed(data: unknown): Promise<void> {
    const payload = data as WebhookPayload;
    const reference = payload.reference as string;

    if (reference?.startsWith(SETTLEMENT_REFERENCE_PREFIX)) {
      return this.handleSettlementTransferReversed(data);
    }

    const payoutId = reference;

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

  // ── Merchant settlement transfer webhooks ────────────────────────────────
  // These are the final authority for settlement completion (§12 of the
  // revised business model) — the transfer worker only records that it
  // *called* Paystack, never that the transfer succeeded.

  private static async handleSettlementTransferSuccess(
    data: unknown,
  ): Promise<void> {
    const payload = data as WebhookPayload;
    const settlementId = (payload.reference as string).replace(
      SETTLEMENT_REFERENCE_PREFIX,
      "",
    );
    const transferCode = payload.transfer_code as string;

    logger.info("[webhook] settlement transfer.success", {
      settlementId,
      transferCode,
    });

    const settlement = await prisma.merchantSettlementRequest.findUnique({
      where: { settlementId },
      include: { companyBankAccount: true },
    });

    if (!settlement) {
      logger.error(
        "[webhook] settlement transfer.success — settlement not found",
        { settlementId },
      );
      return;
    }

    if (settlement.status === MerchantSettlementStatus.TRANSFER_SUCCESS) {
      logger.info(
        "[webhook] settlement transfer.success — already TRANSFER_SUCCESS, skipping",
        { settlementId },
      );
      return;
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.merchantSettlementRequest.update({
        where: { settlementId },
        data: {
          status: MerchantSettlementStatus.TRANSFER_SUCCESS,
          webhookReceivedAt: now,
          transferCompletedAt: now,
        },
      });

      await tx.merchantSettlementAuditTrail.create({
        data: {
          settlementId,
          action: "WEBHOOK_RECEIVED",
          actorType: SettlementAuditActor.WEBHOOK,
          outcome: "SUCCESS",
          details: `transfer.success received, transferCode=${transferCode}.`,
        },
      });

      await tx.merchantSettlementAuditTrail.create({
        data: {
          settlementId,
          action: "TRANSFER_SUCCESS",
          actorType: SettlementAuditActor.WEBHOOK,
          outcome: "SUCCESS",
          details: "Settlement marked complete by verified Paystack webhook.",
        },
      });

      await LedgerService.recordTransaction(
        {
          reference: `SETTLEMENT_TRANSFER_SUCCESS_${settlementId}`,
          description: `Settlement transfer confirmed for company ${settlement.companyId}`,
          companyId: settlement.companyId,
          metadata: { settlementId, transferCode },
          entries: [
            {
              accountName: "PAYOUTS_IN_TRANSIT",
              accountType: AccountType.ASSET,
              debit: settlement.amount,
            },
            {
              accountName: "BANK_SETTLED",
              accountType: AccountType.ASSET,
              credit: settlement.amount,
            },
          ],
        },
        tx,
      );
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: settlement.companyId, role: "COMPANY" },
      select: { email: true },
    });

    const maskedAccount =
      settlement.companyBankAccount?.accountNumber
        ?.slice(-4)
        .padStart(
          settlement.companyBankAccount.accountNumber.length,
          "*",
        ) ?? "****";

    emitEvent(DomainEvent.MERCHANT_SETTLEMENT_TRANSFER_SUCCESS, {
      companyId: settlement.companyId,
      companyEmails: companyUsers.map((u) => u.email),
      settlementId,
      amount: Number(settlement.amount),
      transferCode,
      bankName: settlement.companyBankAccount?.bankName ?? "Bank",
      maskedAccount,
      dashboard_url: process.env.FRONTEND_URL,
    });

    logger.info("[webhook] settlement transfer.success — TRANSFER_SUCCESS", {
      settlementId,
    });
  }

  private static async handleSettlementTransferFailed(
    data: unknown,
  ): Promise<void> {
    const payload = data as WebhookPayload;
    const settlementId = (payload.reference as string).replace(
      SETTLEMENT_REFERENCE_PREFIX,
      "",
    );
    const failReason =
      ((payload.failures as unknown as Array<{ reason?: string }>)?.[0]?.reason as string) ??
      "Transfer failed";

    logger.warn("[webhook] settlement transfer.failed", {
      settlementId,
      failReason,
    });

    const settlement = await prisma.merchantSettlementRequest.findUnique({
      where: { settlementId },
    });

    if (!settlement) {
      logger.error(
        "[webhook] settlement transfer.failed — settlement not found",
        { settlementId },
      );
      return;
    }

    if (settlement.status === MerchantSettlementStatus.TRANSFER_FAILED) return;

    await prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.merchantSettlementRequest.update({
        where: { settlementId },
        data: {
          status: MerchantSettlementStatus.TRANSFER_FAILED,
          webhookReceivedAt: now,
          transferFailedAt: now,
          transferFailReason: failReason,
        },
      });

      await tx.merchantSettlementAuditTrail.create({
        data: {
          settlementId,
          action: "TRANSFER_FAILED",
          actorType: SettlementAuditActor.WEBHOOK,
          outcome: "FAILURE",
          details: failReason,
        },
      });

      await LedgerService.recordTransaction(
        {
          reference: `SETTLEMENT_TRANSFER_FAILED_${settlementId}`,
          description: `Settlement transfer failed — restoring merchant liability for company ${settlement.companyId}`,
          companyId: settlement.companyId,
          metadata: { settlementId, reason: failReason },
          entries: [
            {
              accountName: "PAYOUTS_IN_TRANSIT",
              accountType: AccountType.ASSET,
              debit: settlement.amount,
            },
            {
              accountName: "MERCHANT_PAYABLE",
              accountType: AccountType.LIABILITY,
              credit: settlement.amount,
            },
          ],
        },
        tx,
      );
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: settlement.companyId, role: "COMPANY" },
      select: { email: true },
    });

    emitEvent(DomainEvent.MERCHANT_SETTLEMENT_TRANSFER_FAILED, {
      companyId: settlement.companyId,
      companyEmails: companyUsers.map((u) => u.email),
      settlementId,
      amount: Number(settlement.amount),
      reason: failReason,
      dashboard_url: process.env.FRONTEND_URL,
    });

    logger.warn(
      "[webhook] settlement transfer.failed — merchant liability restored",
      { settlementId },
    );
  }

  private static async handleSettlementTransferReversed(
    data: unknown,
  ): Promise<void> {
    const payload = data as WebhookPayload;
    const settlementId = (payload.reference as string).replace(
      SETTLEMENT_REFERENCE_PREFIX,
      "",
    );

    logger.warn("[webhook] settlement transfer.reversed", { settlementId });

    const settlement = await prisma.merchantSettlementRequest.findUnique({
      where: { settlementId },
    });

    if (!settlement) {
      logger.error(
        "[webhook] settlement transfer.reversed — settlement not found",
        { settlementId },
      );
      return;
    }

    if (settlement.status === MerchantSettlementStatus.TRANSFER_REVERSED) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.merchantSettlementRequest.update({
        where: { settlementId },
        data: {
          status: MerchantSettlementStatus.TRANSFER_REVERSED,
          webhookReceivedAt: now,
          transferFailedAt: now,
          transferFailReason: "Transfer reversed by Paystack",
        },
      });

      await tx.merchantSettlementAuditTrail.create({
        data: {
          settlementId,
          action: "TRANSFER_REVERSED",
          actorType: SettlementAuditActor.WEBHOOK,
          outcome: "FAILURE",
          details: "Transfer reversed by Paystack.",
        },
      });

      await LedgerService.recordTransaction(
        {
          reference: `SETTLEMENT_TRANSFER_REVERSED_${settlementId}`,
          description: `Settlement transfer reversed — merchant liability restored for company ${settlement.companyId}`,
          companyId: settlement.companyId,
          metadata: { settlementId },
          entries: [
            {
              accountName: "BANK_SETTLED",
              accountType: AccountType.ASSET,
              debit: settlement.amount,
            },
            {
              accountName: "MERCHANT_PAYABLE",
              accountType: AccountType.LIABILITY,
              credit: settlement.amount,
            },
          ],
        },
        tx,
      );
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: settlement.companyId, role: "COMPANY" },
      select: { email: true },
    });

    emitEvent(DomainEvent.MERCHANT_SETTLEMENT_TRANSFER_REVERSED, {
      companyId: settlement.companyId,
      companyEmails: companyUsers.map((u) => u.email),
      settlementId,
      amount: Number(settlement.amount),
      dashboard_url: process.env.FRONTEND_URL,
    });

    logger.warn(
      "[webhook] settlement transfer.reversed — reservations restored",
      { settlementId },
    );
  }
}
