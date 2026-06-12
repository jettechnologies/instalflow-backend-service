import type { Request, Response } from "express";
import {
  AccountType,
  CommissionAllocationStatus,
  CommissionPayoutStatus,
  CommissionStatus,
  Prisma,
  prisma,
} from "@/infrastructure/prisma";
import logger from "@/infrastructure/logger/logger";
import { SubscriptionService } from "@/core/services/subscription.service";
import { onboardingQueue } from "@/infrastructure/queues/onboarding.queue";
import { paymentQueue } from "@/infrastructure/queues/payment.queue";
import { PaystackService } from "@/core/services/paystack.service";
import { MetadataType } from "@/shared/utils/helpers/misc";
import { LedgerService } from "@/core/services/ledger.service";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";
import {
  derivePostPaymentStatus,
  deriveReservationStatus,
} from "@/shared/utils/helpers/commission-helper";

export class WebhookController {
  static async handlePaystack(req: Request, res: Response) {
    const signature = req.headers["x-paystack-signature"] as string;

    // ─────────────────────────────────────────────────────────────
    // 1. Validate Signature Header
    // ─────────────────────────────────────────────────────────────
    if (!signature) {
      logger.webhook.signatureFailure({
        reason: "missing_signature_header",
      });

      return res.status(400).send("Missing signature");
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Normalize Raw Body
    // ─────────────────────────────────────────────────────────────
    let rawBody: string;

    try {
      if (Buffer.isBuffer(req.body)) {
        // express.raw()
        rawBody = req.body.toString("utf8");
      } else if (typeof req.body === "string") {
        // express.text()
        rawBody = req.body;
      } else if (typeof req.body === "object" && req.body !== null) {
        // express.json()
        rawBody = JSON.stringify(req.body);
      } else {
        logger.webhook.signatureFailure({
          reason: "unparseable_body",
        });

        return res.status(400).send("Invalid body");
      }
    } catch (error) {
      logger.webhook.signatureFailure({
        reason: "body_normalization_failed",
        error,
      });

      return res.status(400).send("Invalid payload");
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Verify Webhook Signature
    // ─────────────────────────────────────────────────────────────
    const isValid = PaystackService.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      logger.webhook.signatureFailure({
        reason: "invalid_signature",
        received: signature,
      });

      return res.status(400).send("Invalid signature");
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Parse Webhook Event Safely
    // ─────────────────────────────────────────────────────────────
    let event: any;

    try {
      if (Buffer.isBuffer(req.body)) {
        event = JSON.parse(req.body.toString("utf8"));
      } else if (typeof req.body === "string") {
        event = JSON.parse(req.body);
      } else {
        event = req.body;
      }
    } catch (error) {
      logger.webhook.signatureFailure({
        reason: "json_parse_failure",
        error,
      });

      return res.status(400).send("Malformed JSON");
    }

    // ─────────────────────────────────────────────────────────────
    // 5. Validate Webhook Structure
    // ─────────────────────────────────────────────────────────────
    if (!event?.event || !event?.data?.id) {
      logger.webhook.signatureFailure({
        reason: "invalid_event_structure",
        payload: event,
      });

      return res.status(400).send("Invalid webhook structure");
    }

    logger.webhook.received(event.event, {
      event_id: event.data.id,
      metadata_type: event.data.metadata?.type,
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Idempotency Check
    // ─────────────────────────────────────────────────────────────
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: {
        id: event.data.id.toString(),
      },
    });

    if (existingEvent) {
      logger.webhook.duplicate(event.data.id.toString(), {
        event_type: event.event,
      });

      return res.status(200).send("Event already processed");
    }

    // ─────────────────────────────────────────────────────────────
    // 7. Persist Webhook Event
    // ─────────────────────────────────────────────────────────────
    await prisma.webhookEvent.create({
      data: {
        id: event.data.id.toString(),
        source: "PAYSTACK",
        type: event.event,
        payload: event, // store full payload
      },
    });

    // ─────────────────────────────────────────────────────────────
    // 8. Process Webhook Event
    // ─────────────────────────────────────────────────────────────
    try {
      switch (event.event) {
        case "charge.success":
          await WebhookController.handleChargeSuccess(event.data);
          break;
        case "transfer.success":
          await WebhookController.handleTransferSuccess(event.data);
          break;

        case "transfer.failed":
          await WebhookController.handleTransferFailed(event.data);
          break;

        case "transfer.reversed":
          await WebhookController.handleTransferReversed(event.data);
          break;

        default:
          logger.webhook.received(event.event, {
            ignored: true,
          });
          break;
      }

      // Mark webhook as processed
      await prisma.webhookEvent.update({
        where: {
          id: event.data.id.toString(),
        },
        data: {
          processed: true,
        },
      });

      logger.webhook.processed(event.event, {
        event_id: event.data.id,
        metadata_type: event.data.metadata?.type,
      });

      return res.status(200).send("Webhook Processed");
    } catch (error: any) {
      logger.webhook.failed(event.event, error, {
        event_id: event.data.id,
      });

      return res.status(500).send("Internal Server Error during processing");
    }
  }

  private static async handleChargeSuccess(data: any) {
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
        const installmentId = data.metadata?.installmentId;
        if (!installmentId) {
          logger.error("No installmentId found in webhook metadata", {
            reference,
          });
          return;
        }

        await paymentQueue.add(
          "process-payment",
          {
            installmentId,
            amount: data.amount / 100,
            reference,
            gatewayRef: data.id.toString(),
          },
          {
            jobId: reference,
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        logger.info(
          `[webhook] → paymentQueue  installmentId=${installmentId} reference=${reference}`,
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

  private static async handleTransferSuccess(data: any) {
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
      // ── 1. Finalise payout ──────────────────────────────────────────────
      await tx.commissionPayoutRequest.update({
        where: { payoutId },
        data: {
          status: CommissionPayoutStatus.PAID,
          paidAt: new Date(),
          transferCompletedAt: new Date(),
        },
      });

      // ── 2. Per-allocation: mark PAID + update commission status ─────────
      for (const allocation of payout.commissionAllocations) {
        if (allocation.status !== CommissionAllocationStatus.RESERVED) continue;

        // Mark this allocation PAID
        await tx.commissionAllocation.update({
          where: { allocationId: allocation.allocationId },
          data: { status: CommissionAllocationStatus.PAID },
        });

        // New reserved amount (release this allocation's hold)
        const newReservedAmount = allocation.commission.reservedAmount.minus(
          allocation.allocatedAmount,
        );

        // Sum ALL paid allocations for this commission (including this one)
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

      // ── 3. Ledger: Payouts_In_Transit → Bank_Settled ─────────────────────
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

    // ── Emit domain events (outside transaction) ──────────────────────────────
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

  private static async handleTransferFailed(data: any) {
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
      // ── 1. Mark payout TRANSFER_FAILED ─────────────────────────────────
      await tx.commissionPayoutRequest.update({
        where: { payoutId },
        data: {
          status: CommissionPayoutStatus.TRANSFER_FAILED,
          transferFailedAt: new Date(),
          transferFailReason: failReason,
        },
      });

      // ── 2. Release commissionAllocations + restore commission reservations ────────
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
            // PRD: 0 → ACTIVE | < amount → PARTIALLY_RESERVED | == amount → RESERVED
            status: deriveReservationStatus(
              newReservedAmount,
              allocation.commission.amount,
            ),
          },
        });
      }

      // ── 3. Ledger: reverse in-transit, restore Commission_Payable ───────
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

    // ── Emit domain events ────────────────────────────────────────────────────
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

  private static async handleTransferReversed(data: any) {
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
      // ── 1. Mark payout TRANSFER_REVERSED ───────────────────────────────
      await tx.commissionPayoutRequest.update({
        where: { payoutId },
        data: {
          status: CommissionPayoutStatus.TRANSFER_REVERSED,
          transferFailedAt: new Date(),
          transferFailReason: "Transfer reversed by Paystack",
        },
      });

      // ── 2. PAID commissionAllocations → back to RESERVED; restore reservedAmount ──
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

      // ── 3. Ledger: money returned to bank, restore Commission_Payable ────
      // DEBIT  Bank_Settled      (ASSET ↑ — money returned by Paystack)
      // CREDIT Commission_Payable (LIABILITY ↑ — we owe marketer again)
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

    // ── Emit domain events ────────────────────────────────────────────────────
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

//   private static async handleTransferSuccess(data: any) {
//     const payoutId = data.reference as string;
//     const transferCode = data.transfer_code as string;

//     logger.info("[webhook] transfer.success", { payoutId, transferCode });

//     const payout = await prisma.commissionPayoutRequest.findUnique({
//       where: { payoutId },
//       include: { user: true },
//     });

//     if (!payout) {
//       logger.error("[webhook] transfer.success — payout not found", {
//         payoutId,
//       });
//       return;
//     }

//     // Idempotency: already finalised
//     if (payout.status === CommissionPayoutStatus.PAID) {
//       logger.info("[webhook] transfer.success — already PAID, skipping", {
//         payoutId,
//       });
//       return;
//     }

//     await prisma.$transaction(async (tx) => {
//       // ── 1. Finalise payout record ──────────────────────────────────────
//       await tx.commissionPayoutRequest.update({
//         where: { payoutId },
//         data: {
//           status: CommissionPayoutStatus.PAID,
//           paidAt: new Date(),
//           transferCompletedAt: new Date(),
//         },
//       });

//       // ── 2. Mark the marketer's approved commissions as PAID ───────────
//       await tx.commission.updateMany({
//         where: { userId: payout.userId, status: CommissionStatus.ACTIVE },
//         data: { status: CommissionStatus.PAID },
//       });

//       // ── 3. Ledger: clear Payouts_In_Transit
//       //  DEBIT  Payouts_In_Transit (ASSET ↓ — money has left the system)
//       //  CREDIT Bank_Settled       (ASSET ↓ — reflects outflow from settled funds)
//       await LedgerService.recordTransaction(
//         {
//           reference: `TRANSFER_SUCCESS_${payoutId}`,
//           description: `Transfer confirmed for marketer ${payout.userId}`,
//           companyId: payout.companyId,
//           metadata: { payoutId, transferCode },
//           entries: [
//             {
//               accountName: "PAYOUTS_IN_TRANSIT",
//               accountType: AccountType.ASSET,
//               debit: payout.amount,
//             },
//             {
//               accountName: "BANK_SETTLED",
//               accountType: AccountType.ASSET,
//               credit: payout.amount,
//             },
//           ],
//         },
//         tx,
//       );
//     });

//     logger.info("[webhook] transfer.success — payout PAID", { payoutId });
//   }

//   private static async handleTransferFailed(data: any) {
//     const payoutId = data.reference as string;
//     const failReason =
//       (data.failures?.[0]?.reason as string) ?? "Transfer failed";

//     logger.warn("[webhook] transfer.failed", { payoutId, failReason });

//     const payout = await prisma.commissionPayoutRequest.findUnique({
//       where: { payoutId },
//     });

//     if (!payout) {
//       logger.error("[webhook] transfer.failed — payout not found", {
//         payoutId,
//       });
//       return;
//     }

//     if (payout.status === CommissionPayoutStatus.TRANSFER_FAILED) return;

//     await prisma.$transaction(async (tx) => {
//       // ── 1. Mark payout as TRANSFER_FAILED ─────────────────────────────
//       await tx.commissionPayoutRequest.update({
//         where: { payoutId },
//         data: {
//           status: CommissionPayoutStatus.TRANSFER_FAILED,
//           transferFailedAt: new Date(),
//           transferFailReason: failReason,
//         },
//       });

//       // ── 2. Reverse ledger: restore Commission_Payable, clear In-Transit
//       //  DEBIT  Payouts_In_Transit  (reverse the in-transit entry)
//       //  CREDIT Commission_Payable  (restore the obligation to the marketer)
//       await LedgerService.recordTransaction(
//         {
//           reference: `TRANSFER_FAILED_${payoutId}`,
//           description: `Transfer failed — restoring commission liability for ${payout.userId}`,
//           companyId: payout.companyId,
//           metadata: { payoutId, reason: failReason },
//           entries: [
//             {
//               accountName: "PAYOUTS_IN_TRANSIT",
//               accountType: AccountType.ASSET,
//               debit: payout.amount,
//             },
//             {
//               accountName: "COMMISSION_PAYABLE",
//               accountType: AccountType.LIABILITY,
//               credit: payout.amount,
//             },
//           ],
//         },
//         tx,
//       );

//       // ── 3. Restore commission records to APPROVED ─────────────────────
//       await tx.commission.updateMany({
//         where: { userId: payout.userId, status: CommissionStatus.ACTIVE },
//         data: { status: CommissionStatus.ACTIVE }, // already there, but be explicit
//       });
//     });

//     logger.warn("[webhook] transfer.failed — payout reverted to APPROVED", {
//       payoutId,
//     });
//   }

//   private static async handleTransferReversed(data: any) {
//     const payoutId = data.reference as string;

//     logger.warn("[webhook] transfer.reversed", { payoutId });

//     const payout = await prisma.commissionPayoutRequest.findUnique({
//       where: { payoutId },
//     });

//     if (!payout) {
//       logger.error("[webhook] transfer.reversed — payout not found", {
//         payoutId,
//       });
//       return;
//     }

//     if (payout.status === CommissionPayoutStatus.TRANSFER_REVERSED) return;

//     await prisma.$transaction(async (tx) => {
//       await tx.commissionPayoutRequest.update({
//         where: { payoutId },
//         data: {
//           status: CommissionPayoutStatus.TRANSFER_REVERSED,
//           transferFailedAt: new Date(),
//           transferFailReason: "Transfer reversed by Paystack",
//         },
//       });

//       // Reversal ledger:
//       // DEBIT  Bank_Settled        (money returned to bank)
//       // CREDIT Payouts_In_Transit  (clear in-transit)
//       // AND restore the liability:
//       // DEBIT  Payouts_In_Transit
//       // CREDIT Commission_Payable
//       await LedgerService.recordTransaction(
//         {
//           reference: `TRANSFER_REVERSED_${payoutId}`,
//           description: `Transfer reversed — restoring commission liability for ${payout.userId}`,
//           companyId: payout.companyId,
//           metadata: { payoutId },
//           entries: [
//             // Money returned to bank
//             {
//               accountName: "BANK_SETTLED",
//               accountType: AccountType.ASSET,
//               debit: payout.amount,
//             },
//             // Clear In-Transit
//             {
//               accountName: "PAYOUTS_IN_TRANSIT",
//               accountType: AccountType.ASSET,
//               credit: payout.amount,
//             },
//             // Restore liability
//             {
//               accountName: "COMMISSION_PAYABLE",
//               accountType: AccountType.LIABILITY,
//               credit: payout.amount,
//             },
//             // Offset: debit to prevent double-counting Bank_Settled
//             {
//               accountName: "PAYOUTS_IN_TRANSIT",
//               accountType: AccountType.ASSET,
//               debit: payout.amount,
//             },
//           ],
//         },
//         tx,
//       );

//       // Restore commission records to APPROVED
//       await tx.commission.updateMany({
//         where: { userId: payout.userId, status: CommissionStatus.PAID },
//         data: { status: CommissionStatus.ACTIVE },
//       });
//     });

//     logger.warn(
//       "[webhook] transfer.reversed — commission restored to APPROVED",
//       { payoutId },
//     );
//   }
// }
