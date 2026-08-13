import {
  prisma,
  Prisma,
  Role,
  InstallmentStatus,
  PaymentStatus,
  MerchantSettlementStatus,
  SettlementAuditActor,
} from "@/infrastructure/prisma";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/shared/utils/AppError";
import { merchantSettlementTransferQueue } from "@/infrastructure/queues/merchant-settlement-transfer.queue";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";

const RETRYABLE_STATUSES: MerchantSettlementStatus[] = [
  MerchantSettlementStatus.TRANSFER_FAILED,
  MerchantSettlementStatus.TRANSFER_REVERSED,
];

// Company settlement is a fully automatic financial obligation — no company
// ever requests, approves, or initiates its own settlement here. See
// DOMAIN_MODEL.md "Merchant Settlement" and PROJECT_WORKFLOW.md §0.
export class MerchantSettlementService {
  /**
   * Generates (and auto-approves) a settlement for one company from its
   * currently-unsettled PAID installments. Idempotent by construction: an
   * installment with an existing MerchantSettlementLine is never selected
   * again, so a repeat run with nothing new to settle creates nothing.
   */
  static async generateForCompany(companyId: string) {
    const eligibleInstallments = await prisma.installment.findMany({
      where: {
        status: InstallmentStatus.PAID,
        merchantSettlementLine: null,
        financingContract: { user: { companyId } },
      },
      include: {
        payments: {
          where: { status: PaymentStatus.SUCCESS },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { commissions: true },
        },
      },
    });

    if (eligibleInstallments.length === 0) {
      return null;
    }

    const lines = eligibleInstallments.map((inst) => {
      const payment = inst.payments[0];
      const commissionDeducted = (payment?.commissions ?? []).reduce(
        (sum, c) => sum.plus(c.amount),
        new Prisma.Decimal(0),
      );
      return {
        installmentId: inst.installmentId,
        grossAmount: inst.amount,
        commissionDeducted,
        netAmount: inst.amount.minus(commissionDeducted),
        paidAt: inst.paidAt,
      };
    });

    const totalAmount = lines.reduce(
      (sum, l) => sum.plus(l.netAmount),
      new Prisma.Decimal(0),
    );

    if (totalAmount.lessThanOrEqualTo(0)) {
      return null;
    }

    const paidDates = lines
      .map((l) => l.paidAt)
      .filter((d): d is Date => !!d);
    const periodStart =
      paidDates.length > 0
        ? new Date(Math.min(...paidDates.map((d) => d.getTime())))
        : new Date();
    const periodEnd = new Date();

    const settlement = await prisma.$transaction(async (tx) => {
      const created = await tx.merchantSettlementRequest.create({
        data: {
          companyId,
          periodStart,
          periodEnd,
          amount: totalAmount,
          status: MerchantSettlementStatus.GENERATED,
        },
      });

      await tx.merchantSettlementLine.createMany({
        data: lines.map((l) => ({
          settlementId: created.settlementId,
          installmentId: l.installmentId,
          grossAmount: l.grossAmount,
          commissionDeducted: l.commissionDeducted,
          netAmount: l.netAmount,
        })),
      });

      await tx.merchantSettlementAuditTrail.create({
        data: {
          settlementId: created.settlementId,
          action: "GENERATED",
          actorType: SettlementAuditActor.SYSTEM,
          outcome: "SUCCESS",
          details: `Generated from ${lines.length} paid installment(s).`,
        },
      });

      const approved = await tx.merchantSettlementRequest.update({
        where: { settlementId: created.settlementId },
        data: {
          status: MerchantSettlementStatus.APPROVED,
          approvedAt: new Date(),
        },
      });

      await tx.merchantSettlementAuditTrail.create({
        data: {
          settlementId: created.settlementId,
          action: "APPROVED",
          actorType: SettlementAuditActor.SYSTEM,
          outcome: "SUCCESS",
          details: "Auto-approved — settlement has no manual approval step.",
        },
      });

      return approved;
    });

    const companyEmails = (
      await prisma.user.findMany({
        where: { companyId, role: Role.COMPANY },
        select: { email: true },
      })
    ).map((u) => u.email);

    emitEvent(DomainEvent.MERCHANT_SETTLEMENT_GENERATED, {
      companyId,
      companyEmails,
      settlementId: settlement.settlementId,
      amount: Number(settlement.amount),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      dashboard_url: process.env.FRONTEND_URL,
    });

    return settlement;
  }

  /** Scheduler entry point — generates settlements for every company with unsettled paid installments. */
  static async generatePendingSettlements() {
    const rows = await prisma.installment.findMany({
      where: { status: InstallmentStatus.PAID, merchantSettlementLine: null },
      select: {
        financingContract: { select: { user: { select: { companyId: true } } } },
      },
    });

    const companyIds = Array.from(
      new Set(
        rows
          .map((r) => r.financingContract.user?.companyId)
          .filter((id): id is string => !!id),
      ),
    );

    const created = [];
    for (const companyId of companyIds) {
      const settlement = await this.generateForCompany(companyId);
      if (settlement) created.push(settlement);
    }
    return created;
  }

  /**
   * Auto-queues the transfer for any APPROVED settlement whose company has a
   * verified primary bank account — this is what makes a bank account added
   * after generation still get paid automatically on the next run, with no
   * HTTP call from anyone required.
   */
  static async queueEligibleTransfers() {
    const eligible = await prisma.merchantSettlementRequest.findMany({
      where: {
        status: MerchantSettlementStatus.APPROVED,
        transferInitiatedAt: null,
        company: {
          bankAccounts: { some: { isPrimary: true, isVerified: true } },
        },
      },
    });

    const queued: string[] = [];

    for (const settlement of eligible) {
      await prisma.$transaction(async (tx) => {
        await tx.merchantSettlementRequest.update({
          where: { settlementId: settlement.settlementId },
          data: {
            status: MerchantSettlementStatus.TRANSFER_INITIATED,
            transferQueuedAt: new Date(),
            transferInitiatedAt: new Date(),
          },
        });

        await tx.merchantSettlementAuditTrail.create({
          data: {
            settlementId: settlement.settlementId,
            action: "TRANSFER_INITIATED",
            actorType: SettlementAuditActor.SCHEDULER,
            outcome: "SUCCESS",
            details:
              "Transfer auto-queued — company has a verified primary bank account.",
          },
        });
      });

      await merchantSettlementTransferQueue.add(
        "process-settlement-transfer",
        { settlementId: settlement.settlementId },
        { jobId: `settlement-transfer:${settlement.settlementId}:${Date.now()}` },
      );

      queued.push(settlement.settlementId);
    }

    return queued;
  }

  private static async assertVisible(
    companyId: string,
    userId: string,
    role: Role,
  ) {
    if (role === Role.SUPER_ADMIN) return;
    if (role === Role.COMPANY || role === Role.ADMIN) {
      const user = await prisma.user.findUnique({
        where: { userId },
        select: { companyId: true },
      });
      if (!user || user.companyId !== companyId) {
        throw new UnauthorizedError(
          "This settlement does not belong to your company.",
        );
      }
      return;
    }
    throw new UnauthorizedError(
      "You are not authorized to view merchant settlements.",
    );
  }

  static async listSettlements(params: {
    userId: string;
    role: Role;
    page?: number;
    limit?: number;
  }) {
    const { userId, role, limit = 10, page = 1 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.MerchantSettlementRequestWhereInput = {};

    if (role === Role.COMPANY || role === Role.ADMIN) {
      const user = await prisma.user.findUnique({
        where: { userId },
        select: { companyId: true },
      });
      if (!user?.companyId) {
        throw new BadRequestError("Account is not associated with a company.");
      }
      where.companyId = user.companyId;
    } else if (role !== Role.SUPER_ADMIN) {
      throw new UnauthorizedError(
        "You are not authorized to view merchant settlements.",
      );
    }

    const [items, total] = await Promise.all([
      prisma.merchantSettlementRequest.findMany({
        where,
        include: { companyBankAccount: true, settlementLines: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.merchantSettlementRequest.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  static async getSettlementById(
    settlementId: string,
    userId: string,
    role: Role,
  ) {
    const settlement = await prisma.merchantSettlementRequest.findUnique({
      where: { settlementId },
      include: { companyBankAccount: true, settlementLines: true },
    });

    if (!settlement) throw new NotFoundError("Settlement not found.");

    await this.assertVisible(settlement.companyId, userId, role);

    return settlement;
  }

  /** SUPER_ADMIN (any) or COMPANY (own only) — matches "reveal if any issue comes up." */
  static async getAuditTrail(settlementId: string, userId: string, role: Role) {
    const settlement = await prisma.merchantSettlementRequest.findUnique({
      where: { settlementId },
      select: { companyId: true },
    });
    if (!settlement) throw new NotFoundError("Settlement not found.");

    if (role === Role.COMPANY) {
      const user = await prisma.user.findUnique({
        where: { userId },
        select: { companyId: true },
      });
      if (!user || user.companyId !== settlement.companyId) {
        throw new UnauthorizedError(
          "This settlement does not belong to your company.",
        );
      }
    } else if (role !== Role.SUPER_ADMIN) {
      throw new UnauthorizedError(
        "You are not authorized to view this audit trail.",
      );
    }

    return prisma.merchantSettlementAuditTrail.findMany({
      where: { settlementId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * SUPER_ADMIN-only operational recovery — retries a failed/reversed
   * transfer. Not an approval step: mirrors CommissionService.initiateTransfer's
   * existing retry-from-failure handling (re-invocation from a terminal
   * failure state is already the established pattern in this codebase).
   */
  static async retryTransfer(settlementId: string, superAdminUserId: string) {
    const admin = await prisma.user.findUnique({
      where: { userId: superAdminUserId },
    });

    if (!admin || admin.role !== Role.SUPER_ADMIN) {
      throw new UnauthorizedError(
        "Only SUPER_ADMIN can retry a settlement transfer.",
      );
    }

    const settlement = await prisma.merchantSettlementRequest.findUnique({
      where: { settlementId },
    });

    if (!settlement) throw new NotFoundError("Settlement not found.");

    if (!RETRYABLE_STATUSES.includes(settlement.status)) {
      throw new BadRequestError(
        `Cannot retry. Current status: ${settlement.status}`,
      );
    }

    const nextRetryCount = settlement.retryCount + 1;

    await prisma.$transaction(async (tx) => {
      await tx.merchantSettlementRequest.update({
        where: { settlementId },
        data: {
          status: MerchantSettlementStatus.TRANSFER_INITIATED,
          retryCount: nextRetryCount,
          lastRetryAt: new Date(),
          retryInitiatedById: superAdminUserId,
          transferFailedAt: null,
          transferFailReason: null,
          // A reversed transfer already produced a transferCode once; clear
          // it so the worker initiates a genuinely new Paystack transfer
          // instead of treating the old (reversed) one as still valid.
          transferCode: null,
        },
      });

      await tx.merchantSettlementAuditTrail.create({
        data: {
          settlementId,
          action: "RETRY_INITIATED",
          actorType: SettlementAuditActor.USER,
          performedById: superAdminUserId,
          outcome: "SUCCESS",
          details: `Retry #${nextRetryCount} initiated by SUPER_ADMIN.`,
        },
      });
    });

    await merchantSettlementTransferQueue.add(
      "process-settlement-transfer",
      { settlementId },
      { jobId: `settlement-transfer:${settlementId}:retry:${Date.now()}` },
    );

    return { success: true, retryCount: nextRetryCount };
  }
}
