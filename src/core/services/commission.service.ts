import {
  prisma,
  Prisma,
  CommissionStatus,
  Role,
  AccountType,
  CommissionPayoutStatus,
  CommissionAllocationStatus,
} from "@/infrastructure/prisma";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/shared/utils/AppError";
import { LedgerService } from "@/core/services/ledger.service";
import { NotificationOrchestrator } from "@/infrastructure/internal_notification/notification.orchestrator";
import { NotificationEventType } from "@/infrastructure/internal_notification/notification.types";
import { formatCurrency, maskAccountNumber } from "@/shared/utils/helpers/misc";
import { transferQueue } from "@/infrastructure/queues/transfer.queue";
import { emitEvent } from "../events/emitter";
import { DomainEvent } from "../events/event.types";
import { deriveReservationStatus } from "@/shared/utils/helpers/commission-helper";
import logger from "@/infrastructure/logger/logger";

type LockedCommissionRow = {
  commissionId: string;
  amount: Prisma.Decimal;
  reservedAmount: Prisma.Decimal;
};

export class CommissionService {
  static async getAllTimeCommissions(userId: string) {
    const commissions = await prisma.commission.findMany({
      where: {
        userId,
      },
      include: {
        payment: {
          include: {
            installment: {
              include: {
                financingContract: {
                  include: {
                    product: true,
                    user: true,
                  },
                },
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    const total = commissions.reduce(
      (acc, item) => acc.plus(item.amount),
      new Prisma.Decimal(0),
    );

    return {
      totalCommissions: total,
      totalRecords: commissions.length,
      commissions,
    };
  }

  static async getCommissionPerCustomer(userId: string) {
    const commissions = await prisma.commission.findMany({
      where: {
        userId,
      },
      include: {
        payment: {
          include: {
            installment: {
              include: {
                financingContract: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const grouped: Record<string, any> = {};

    for (const item of commissions) {
      const customer = item.payment?.installment?.financingContract?.user;

      if (!customer) continue;

      if (!grouped[customer.userId]) {
        grouped[customer.userId] = {
          customerId: customer.userId,
          customerName: customer.name,
          customerEmail: customer.email,
          totalCommission: new Prisma.Decimal(0),
        };
      }

      grouped[customer.userId].totalCommission = grouped[
        customer.userId
      ].totalCommission.plus(item.amount);
    }

    return Object.values(grouped);
  }

  static async getCommissionPerProduct(userId: string) {
    const commissions = await prisma.commission.findMany({
      where: {
        userId,
      },
      include: {
        payment: {
          include: {
            installment: {
              include: {
                financingContract: {
                  include: {
                    product: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const grouped: Record<string, any> = {};

    for (const item of commissions) {
      const product = item.payment?.installment?.financingContract?.product;

      if (!product) continue;

      if (!grouped[product.productId]) {
        grouped[product.productId] = {
          productId: product.productId,
          productName: product.name,
          totalCommission: new Prisma.Decimal(0),
        };
      }

      grouped[product.productId].totalCommission = grouped[
        product.productId
      ].totalCommission.plus(item.amount);
    }

    return Object.values(grouped);
  }

  static async getPayoutRequests(
    userId: string,
    role: Role,
    params?: {
      status?: CommissionPayoutStatus;
      page?: number;
      limit?: number;
    },
  ) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;

    const where: Prisma.CommissionPayoutRequestWhereInput = {};

    if (params?.status) {
      where.status = params.status;
    }

    const currentUser = await prisma.user.findUnique({
      where: { userId },
      select: {
        companyId: true,
      },
    });

    if (!currentUser) {
      throw new NotFoundError("User not found");
    }

    switch (role) {
      case Role.MARKETER:
        where.userId = userId;
        break;

      case Role.COMPANY:
        where.companyId = currentUser.companyId!;
        break;

      case Role.ADMIN:
        break;

      default:
        throw new ForbiddenError("Unauthorized");
    }

    const [items, total] = await Promise.all([
      prisma.commissionPayoutRequest.findMany({
        where,
        orderBy: {
          requestedAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              userId: true,
              name: true,
              email: true,
            },
          },
          marketerBankAccount: {
            select: {
              bankName: true,
              accountName: true,
              accountNumber: true,
            },
          },
          commissionAllocations: {
            select: {
              allocationId: true,
              commissionId: true,
              allocatedAmount: true,
              status: true,
            },
          },
        },
      }),
      prisma.commissionPayoutRequest.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: items.map((payout) => ({
        payoutId: payout.payoutId,
        marketer: {
          userId: payout.user.userId,
          name: payout.user.name,
          email: payout.user.email,
        },
        amount: payout.amount,
        status: payout.status,
        transferCode: payout.transferCode,
        requestedAt: payout.requestedAt,
        paidAt: payout.paidAt,
        transferInitiatedAt: payout.transferInitiatedAt,
        transferCompletedAt: payout.transferCompletedAt,
        transferFailedAt: payout.transferFailedAt,
        transferFailReason: payout.transferFailReason,
        bankAccount: payout.marketerBankAccount
          ? {
              bankName: payout.marketerBankAccount.bankName,
              accountName: payout.marketerBankAccount.accountName,
              accountNumber: maskAccountNumber(
                payout.marketerBankAccount.accountNumber,
              ),
            }
          : null,
        allocationsCount: payout.commissionAllocations.length,
      })),

      pagination: {
        currentPage: page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  static async getPayoutById(payoutId: string) {
    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: {
        payoutId,
      },
      include: {
        user: {
          select: {
            userId: true,
            name: true,
            email: true,
          },
        },
        company: {
          select: {
            companyId: true,
            name: true,
          },
        },
        adminApprovedBy: {
          select: {
            userId: true,
            name: true,
            email: true,
          },
        },
        companyApprovedBy: {
          select: {
            userId: true,
            name: true,
            email: true,
          },
        },
        transferInitiatedBy: {
          select: {
            userId: true,
            name: true,
            email: true,
          },
        },
        marketerBankAccount: true,
        commissionAllocations: {
          include: {
            commission: {
              select: {
                commissionId: true,
                amount: true,
                reservedAmount: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!payout) {
      throw new NotFoundError("Payout request not found");
    }

    return {
      payoutId: payout.payoutId,
      amount: payout.amount,
      status: payout.status,
      transferCode: payout.transferCode,
      requestedAt: payout.requestedAt,
      paidAt: payout.paidAt,
      transferInitiatedAt: payout.transferInitiatedAt,
      transferCompletedAt: payout.transferCompletedAt,
      transferFailedAt: payout.transferFailedAt,
      transferFailReason: payout.transferFailReason,
      marketer: payout.user,
      company: payout.company,
      approvals: {
        adminApprovedAt: payout.adminApprovedAt,
        adminApprovedBy: payout.adminApprovedBy,

        companyApprovedAt: payout.companyApprovedAt,
        companyApprovedBy: payout.companyApprovedBy,
      },
      transfer: {
        initiatedAt: payout.transferInitiatedAt,
        initiatedBy: payout.transferInitiatedBy,
        completedAt: payout.transferCompletedAt,
        transferCode: payout.transferCode,
      },
      bankAccount: payout.marketerBankAccount
        ? {
            bankName: payout.marketerBankAccount.bankName,
            accountName: payout.marketerBankAccount.accountName,
            accountNumber: maskAccountNumber(
              payout.marketerBankAccount.accountNumber,
            ),
          }
        : null,

      allocations: payout.commissionAllocations.map((allocation) => ({
        allocationId: allocation.allocationId,
        allocatedAmount: allocation.allocatedAmount,
        status: allocation.status,
        commission: {
          commissionId: allocation.commission.commissionId,
          amount: allocation.commission.amount,
          reservedAmount: allocation.commission.reservedAmount,
          status: allocation.commission.status,
          createdAt: allocation.commission.createdAt,
        },
      })),
    };
  }

  static async requestPayout(userId: string, amount: number) {
    const user = await prisma.user.findUnique({
      where: { userId },
      include: { creator: true },
    });
    if (!user) throw new NotFoundError("User not found");
    if (!user.companyId)
      throw new BadRequestError("User has no associated company");

    const requestedAmount = new Prisma.Decimal(amount);

    if (requestedAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestError("Requested amount must be greater than zero");
    }

    const existingPending = await prisma.commissionPayoutRequest.findFirst({
      where: {
        userId,
        status: {
          in: [
            CommissionPayoutStatus.PENDING_ADMIN_APPROVAL,
            CommissionPayoutStatus.PENDING_COMPANY_APPROVAL,
            CommissionPayoutStatus.APPROVED,
            CommissionPayoutStatus.TRANSFER_INITIATED,
          ],
        },
      },
      select: { status: true, payoutId: true },
    });

    if (existingPending) {
      throw new BadRequestError(
        `You already have a payout in progress (status: ${existingPending.status})`,
      );
    }

    const creatorRole = user.creator?.role;

    if (!creatorRole) {
      throw new BadRequestError(
        "Marketer has no creator relationship configured",
      );
    }

    const payoutRequest = await prisma.$transaction(async (tx) => {
      const lockedCommissions = await tx.$queryRaw<LockedCommissionRow[]>`
      SELECT "commissionId", "amount", "reservedAmount"
      FROM "Commission"
      WHERE "userId" = ${userId}
        AND "status" NOT IN ('PAID', 'FROZEN')
        AND "reservedAmount" < "amount"
      ORDER BY "createdAt" ASC
      FOR UPDATE
    `;

      const commissions = lockedCommissions.map((c) => ({
        commissionId: c.commissionId,
        amount: new Prisma.Decimal(c.amount),
        reservedAmount: new Prisma.Decimal(c.reservedAmount),
      }));

      const totalAvailable = commissions.reduce(
        (acc, c) => acc.plus(c.amount.minus(c.reservedAmount)),
        new Prisma.Decimal(0),
      );

      if (totalAvailable.lessThan(requestedAmount)) {
        throw new BadRequestError(
          `Insufficient available balance. ` +
            `Available: ₦${totalAvailable.toFixed(2)}, Requested: ₦${requestedAmount.toFixed(2)}`,
        );
      }

      type AllocationEntry = {
        commissionId: string;
        toAllocate: Prisma.Decimal;
        currentReserved: Prisma.Decimal;
        totalAmount: Prisma.Decimal;
      };

      const plan: AllocationEntry[] = [];
      let remaining = requestedAmount;

      for (const c of commissions) {
        if (remaining.lessThanOrEqualTo(0)) break;

        const available = c.amount.minus(c.reservedAmount);
        if (available.lessThanOrEqualTo(0)) continue; // defensive; WHERE already excludes these

        const toAllocate = Prisma.Decimal.min(remaining, available);
        plan.push({
          commissionId: c.commissionId,
          toAllocate,
          currentReserved: c.reservedAmount,
          totalAmount: c.amount,
        });
        remaining = remaining.minus(toAllocate);
      }

      const status =
        creatorRole === Role.COMPANY
          ? CommissionPayoutStatus.PENDING_COMPANY_APPROVAL
          : CommissionPayoutStatus.PENDING_ADMIN_APPROVAL;

      const request = await tx.commissionPayoutRequest.create({
        data: {
          userId,
          companyId: user.companyId!,
          amount: requestedAmount,
          status,
        },
        include: { user: true },
      });

      for (const entry of plan) {
        await tx.commissionAllocation.create({
          data: {
            payoutId: request.payoutId,
            commissionId: entry.commissionId,
            allocatedAmount: entry.toAllocate,
            status: CommissionAllocationStatus.RESERVED,
          },
        });

        const newReservedAmount = entry.currentReserved.plus(entry.toAllocate);

        await tx.commission.update({
          where: { commissionId: entry.commissionId },
          data: {
            reservedAmount: newReservedAmount,
            status: deriveReservationStatus(
              newReservedAmount,
              entry.totalAmount,
            ),
          },
        });
      }

      return request;
    });

    if (creatorRole === Role.COMPANY) {
      await NotificationOrchestrator.handle(
        NotificationEventType.COMMISSION_REQUEST_APPROVAL,
        {
          requestId: payoutRequest.payoutId,
          marketerId: payoutRequest.user.userId,
          marketerName: payoutRequest.user.name ?? "Marketer",
          role: Role.ADMIN,
          amount: formatCurrency(amount),
        },
      );
    } else {
      await NotificationOrchestrator.handle(
        NotificationEventType.COMMISSION_TRANSFER_REQUEST,
        {
          requestId: payoutRequest.payoutId,
          marketerName: user.name ?? "",
          amount: formatCurrency(amount),
        },
      );
    }

    return payoutRequest;
  }

  // static async requestPayout(userId: string, amount: number) {
  //   const user = await prisma.user.findUnique({
  //     where: { userId },
  //     include: {
  //       creator: true,
  //     },
  //   });
  //   if (!user) throw new NotFoundError("User not found");
  //   if (!user.companyId)
  //     throw new BadRequestError("User has no associated company");

  //   const requestedAmount = new Prisma.Decimal(amount);

  //   if (requestedAmount.lessThanOrEqualTo(0)) {
  //     throw new BadRequestError("Requested amount must be greater than zero");
  //   }

  //   const existingPending = await prisma.commissionPayoutRequest.findFirst({
  //     where: {
  //       userId,
  //       status: {
  //         in: [
  //           CommissionPayoutStatus.PENDING_ADMIN_APPROVAL,
  //           CommissionPayoutStatus.PENDING_COMPANY_APPROVAL,
  //           CommissionPayoutStatus.APPROVED,
  //           CommissionPayoutStatus.TRANSFER_INITIATED,
  //         ],
  //       },
  //     },
  //     select: { status: true, payoutId: true },
  //   });

  //   if (existingPending) {
  //     throw new BadRequestError(
  //       `You already have a payout in progress (status: ${existingPending.status})`,
  //     );
  //   }

  //   const creatorRole = user.creator?.role;

  //   if (!creatorRole) {
  //     throw new BadRequestError(
  //       "Marketer has no creator relationship configured",
  //     );
  //   }

  //   const payoutRequest = await prisma.$transaction(async (tx) => {
  //     const commissions = await tx.commission.findMany({
  //       where: {
  //         userId,
  //         status: { notIn: [CommissionStatus.PAID, CommissionStatus.FROZEN] },
  //       },
  //       orderBy: { createdAt: "asc" },
  //     });

  //     const totalAvailable = commissions.reduce(
  //       (acc, c) => acc.plus(c.amount.minus(c.reservedAmount)),
  //       new Prisma.Decimal(0),
  //     );

  //     if (totalAvailable.lessThan(requestedAmount)) {
  //       throw new BadRequestError(
  //         `Insufficient available balance. ` +
  //           `Available: ₦${totalAvailable.toFixed(2)}, Requested: ₦${requestedAmount.toFixed(2)}`,
  //       );
  //     }

  //     type AllocationEntry = {
  //       commissionId: string;
  //       toAllocate: Prisma.Decimal;
  //       currentReserved: Prisma.Decimal;
  //       totalAmount: Prisma.Decimal;
  //     };

  //     const plan: AllocationEntry[] = [];
  //     let remaining = requestedAmount;

  //     for (const c of commissions) {
  //       if (remaining.lessThanOrEqualTo(0)) break;

  //       const available = c.amount.minus(c.reservedAmount);
  //       if (available.lessThanOrEqualTo(0)) continue;

  //       const toAllocate = Prisma.Decimal.min(remaining, available);
  //       plan.push({
  //         commissionId: c.commissionId,
  //         toAllocate,
  //         currentReserved: c.reservedAmount,
  //         totalAmount: c.amount,
  //       });
  //       remaining = remaining.minus(toAllocate);
  //     }

  //     const status =
  //       creatorRole === Role.COMPANY
  //         ? CommissionPayoutStatus.PENDING_COMPANY_APPROVAL
  //         : CommissionPayoutStatus.PENDING_ADMIN_APPROVAL;

  //     const request = await tx.commissionPayoutRequest.create({
  //       data: {
  //         userId,
  //         companyId: user.companyId!,
  //         amount: requestedAmount,
  //         status,
  //       },
  //       include: {
  //         user: true,
  //       },
  //     });

  //     for (const entry of plan) {
  //       await tx.commissionAllocation.create({
  //         data: {
  //           payoutId: request.payoutId,
  //           commissionId: entry.commissionId,
  //           allocatedAmount: entry.toAllocate,
  //           status: CommissionAllocationStatus.RESERVED,
  //         },
  //       });

  //       const newReservedAmount = entry.currentReserved.plus(entry.toAllocate);

  //       await tx.commission.update({
  //         where: { commissionId: entry.commissionId },
  //         data: {
  //           reservedAmount: newReservedAmount,
  //           status: deriveReservationStatus(
  //             newReservedAmount,
  //             entry.totalAmount,
  //           ),
  //         },
  //       });
  //     }

  //     return request;
  //   });

  //   if (creatorRole === Role.COMPANY) {
  //     await NotificationOrchestrator.handle(
  //       NotificationEventType.COMMISSION_REQUEST_APPROVAL,
  //       {
  //         requestId: payoutRequest.payoutId,
  //         marketerId: payoutRequest.user.userId,
  //         marketerName: payoutRequest.user.name ?? "Marketer",
  //         role: Role.ADMIN,
  //         amount: formatCurrency(amount),
  //       },
  //     );
  //   } else {
  //     await NotificationOrchestrator.handle(
  //       NotificationEventType.COMMISSION_TRANSFER_REQUEST,
  //       {
  //         requestId: payoutRequest.payoutId,
  //         marketerName: user.name ?? "",
  //         amount: formatCurrency(amount),
  //       },
  //     );
  //   }

  //   return payoutRequest;
  // }

  static async adminApprovePayout(payoutId: string, adminId: string) {
    const admin = await prisma.user.findUnique({
      where: {
        userId: adminId,
      },
    });

    if (!admin || admin.role !== Role.ADMIN) {
      throw new ForbiddenError("Only admins can approve");
    }

    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: {
        payoutId,
        status: CommissionPayoutStatus.PENDING_ADMIN_APPROVAL,
      },
      include: { user: true },
    });

    if (!payout) {
      throw new NotFoundError("Payout request not found");
    }

    const updated = await prisma.commissionPayoutRequest.update({
      where: {
        payoutId,
      },

      data: {
        status: CommissionPayoutStatus.PENDING_COMPANY_APPROVAL,
        adminApprovedById: adminId,
        adminApprovedAt: new Date(),
      },
    });

    await NotificationOrchestrator.handle(
      NotificationEventType.COMMISSION_REQUEST_APPROVAL,
      {
        requestId: payout.payoutId,
        marketerId: payout.user.userId,
        marketerName: payout.user.name ?? "Marketer",
        role: admin.role,
        amount: formatCurrency(Number(payout.amount)),
      },
    );

    return updated;
  }

  static async companyApprovePayout(payoutId: string, companyUserId: string) {
    const approver = await prisma.user.findUnique({
      where: { userId: companyUserId },
    });

    if (!approver || approver.role !== Role.COMPANY) {
      throw new ForbiddenError("Only company accounts can approve payouts");
    }

    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: { payoutId },
      include: { user: true },
    });

    if (!payout) {
      throw new NotFoundError("Payout request not found");
    }

    if (payout.status !== CommissionPayoutStatus.PENDING_COMPANY_APPROVAL) {
      throw new BadRequestError("Payout is not awaiting company approval");
    }

    const updated = await prisma.commissionPayoutRequest.update({
      where: { payoutId },
      data: {
        status: CommissionPayoutStatus.APPROVED,
        companyApprovedById: companyUserId,
        companyApprovedAt: new Date(),
      },
    });

    await NotificationOrchestrator.handle(
      NotificationEventType.COMMISSION_REQUEST_APPROVAL,
      {
        requestId: payout.payoutId,
        marketerId: payout.user.userId,
        marketerName: payout.user.name ?? "Marketer",
        role: approver.role,
        amount: formatCurrency(Number(payout.amount)),
      },
    );

    return updated;
  }

  static async initiateTransfer(payoutId: string, companyUserId: string) {
    const initiator = await prisma.user.findUnique({
      where: { userId: companyUserId },
    });

    if (!initiator || initiator.role !== Role.COMPANY) {
      throw new ForbiddenError("Only company accounts can initiate transfers");
    }

    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: { payoutId },
      include: {
        user: true,
        marketerBankAccount: true,
        commissionAllocations: true,
      },
    });

    if (!payout) throw new NotFoundError("Payout request not found");

    if (payout.companyId !== initiator.companyId) {
      throw new ForbiddenError("This payout does not belong to your company");
    }

    const allowedStatuses = [
      CommissionPayoutStatus.APPROVED,
      CommissionPayoutStatus.TRANSFER_FAILED,
      CommissionPayoutStatus.TRANSFER_REVERSED,
    ];

    if (
      !allowedStatuses.includes(
        payout.status as (typeof allowedStatuses)[number],
      )
    ) {
      throw new BadRequestError(
        `Cannot initiate transfer. Current status: ${payout.status}`,
      );
    }

    const targetBankAccount = await prisma.marketerBankAccount.findFirst({
      where: { userId: payout.userId, isPrimary: true },
    });

    if (!targetBankAccount) {
      throw new BadRequestError(
        "Marketer has no primary bank account. Please ask the marketer to add one.",
      );
    }

    if (payout.status === CommissionPayoutStatus.TRANSFER_FAILED) {
      await prisma.$transaction(async (tx) => {
        const releasedAllocations = await tx.commissionAllocation.findMany({
          where: { payoutId, status: CommissionAllocationStatus.RELEASED },
          include: { commission: true },
        });

        for (const allocation of releasedAllocations) {
          const newReservedAmount = allocation.commission.reservedAmount.plus(
            allocation.allocatedAmount,
          );

          await tx.commissionAllocation.update({
            where: { allocationId: allocation.allocationId },
            data: { status: CommissionAllocationStatus.RESERVED },
          });

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

        await tx.commissionPayoutRequest.update({
          where: { payoutId },
          data: {
            status: CommissionPayoutStatus.APPROVED,
            transferFailReason: null,
          },
        });
      });
    }

    if (payout.status === CommissionPayoutStatus.TRANSFER_REVERSED) {
      await prisma.commissionPayoutRequest.update({
        where: { payoutId },
        data: { status: CommissionPayoutStatus.APPROVED },
      });
    }

    const maskedAccount = targetBankAccount.accountNumber
      .slice(-4)
      .padStart(targetBankAccount.accountNumber.length, "*");

    await prisma.commissionPayoutRequest.update({
      where: { payoutId },
      data: {
        status: CommissionPayoutStatus.TRANSFER_INITIATED,
        marketerBankAccountId: targetBankAccount.id,
        transferInitiatedAt: new Date(),
        transferInitiatedById: companyUserId,
        transferCode: null,
        transferFailedAt: null,
        transferFailReason: null,
      },
    });

    emitEvent(DomainEvent.COMMISSION_TRANSFER_INITIATED, {
      payoutId,
      marketerId: payout.userId,
      marketerName: payout.user.name ?? "Marketer",
      marketerEmail: payout.user.email,
      amount: Number(payout.amount),
      bankName: targetBankAccount.bankName,
      maskedAccount,
      dashboard_url: process.env.FRONTEND_URL,
    });

    await transferQueue.add(
      "process-transfer",
      { payoutId, initiatedByUserId: companyUserId },
      { jobId: `transfer:${payoutId}:${Date.now()}` },
    );

    return { queued: true, payoutId };
  }

  static async initiateBulkTransfer(
    payoutIds: string[],
    companyUserId: string,
  ) {
    if (!payoutIds.length) {
      throw new BadRequestError("payoutIds must not be empty");
    }

    const uniqueIds = [...new Set(payoutIds)];

    const initiator = await prisma.user.findUnique({
      where: { userId: companyUserId },
      select: { role: true, companyId: true },
    });

    if (!initiator || initiator.role !== Role.COMPANY) {
      throw new ForbiddenError("Only company accounts can initiate transfers");
    }

    const payouts = await prisma.commissionPayoutRequest.findMany({
      where: { payoutId: { in: uniqueIds } },
      select: {
        payoutId: true,
        companyId: true,
        userId: true,
        status: true,
        user: {
          select: {
            marketerBankAccounts: {
              where: { isPrimary: true },
              select: { id: true },
            },
          },
        },
      },
    });

    const INITIATABLE = [
      CommissionPayoutStatus.APPROVED,
      CommissionPayoutStatus.TRANSFER_FAILED,
      CommissionPayoutStatus.TRANSFER_REVERSED,
    ] as const;

    const payoutMap = new Map(payouts.map((p) => [p.payoutId, p]));
    const errors: string[] = [];

    for (const id of uniqueIds) {
      const payout = payoutMap.get(id);

      if (!payout) {
        errors.push(`${id}: not found`);
        continue;
      }

      if (payout.companyId !== initiator.companyId) {
        errors.push(`${id}: does not belong to your company`);
        continue;
      }

      if (
        !INITIATABLE.includes(payout.status as (typeof INITIATABLE)[number])
      ) {
        errors.push(
          `${id}: status is ${payout.status} — expected APPROVED, TRANSFER_FAILED, or TRANSFER_REVERSED`,
        );
        continue;
      }

      if (!payout.user.marketerBankAccounts.length) {
        errors.push(
          `${id}: marketer ${payout.userId} has no primary bank account`,
        );
      }
    }

    if (errors.length) {
      throw new BadRequestError(
        `Bulk transfer validation failed (${errors.length} issue${errors.length > 1 ? "s" : ""}):\n${errors.join("\n")}`,
      );
    }

    const results: Array<{
      payoutId: string;
      queued: boolean;
      error?: string;
    }> = [];

    for (const id of uniqueIds) {
      try {
        await this.initiateTransfer(id, companyUserId);
        results.push({ payoutId: id, queued: true });
      } catch (err: any) {
        logger.error(`[bulk-transfer] unexpected failure for ${id}`, err);
        results.push({ payoutId: id, queued: false, error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.queued).length;
    const failed = results.filter((r) => !r.queued).length;

    return {
      total: uniqueIds.length,
      succeeded,
      failed,
      results,
    };
  }
}

/* COMMISSION OLD CODE  */

// static async companyApprovePayout(payoutId: string, companyUserId: string) {
//   const approver = await prisma.user.findUnique({
//     where: {
//       userId: companyUserId,
//     },
//   });

//   if (!approver || approver.role !== Role.COMPANY) {
//     throw new ForbiddenError("Only company accounts can finalize payouts");
//   }

//   const payout = await prisma.commissionPayoutRequest.findUnique({
//     where: {
//       payoutId,
//     },

//     include: {
//       user: true,
//     },
//   });

//   if (!payout) {
//     throw new NotFoundError("Payout request not found");
//   }

//   if (payout.status !== CommissionPayoutStatus.PENDING_COMPANY_APPROVAL) {
//     throw new BadRequestError("Payout is not awaiting company approval");
//   }

//   await prisma.$transaction(async (tx) => {
//     await tx.commissionPayoutRequest.update({
//       where: {
//         payoutId,
//       },

//       data: {
//         status: CommissionPayoutStatus.PAID,
//         companyApprovedById: companyUserId,
//         companyApprovedAt: new Date(),
//         paidAt: new Date(),
//       },
//     });

//     await tx.commission.updateMany({
//       where: {
//         userId: payout.userId,
//         status: CommissionStatus.APPROVED,
//       },

//       data: {
//         status: CommissionStatus.PAID,
//       },
//     });

//     await LedgerService.recordTransaction(
//       {
//         reference: `COMMISSION_PAYOUT_${payout.payoutId}`,

//         description: `Commission payout to marketer ${payout.userId}`,

//         companyId: payout.companyId,

//         entries: [
//           {
//             accountName: "COMMISSION_PAYABLE",
//             accountType: AccountType.LIABILITY,
//             debit: payout.amount,
//           },

//           {
//             accountName: "BANK",
//             accountType: AccountType.ASSET,
//             credit: payout.amount,
//           },
//         ],
//       },

//       tx,
//     );
//   });

//   return {
//     success: true,
//   };
// }

// static async reviewCommissions(
//   commissionIds: string[],
//   action: "APPROVE" | "FREEZE",
//   companyUserId: string,
// ) {
//   if (!commissionIds.length) {
//     throw new BadRequestError("commissionIds must not be empty");
//   }

//   const reviewer = await prisma.user.findUnique({
//     where: { userId: companyUserId },
//     select: { userId: true, role: true, companyId: true },
//   });

//   if (!reviewer || reviewer.role !== Role.COMPANY) {
//     throw new ForbiddenError("Only company accounts can review commissions");
//   }

//   const commissions = await prisma.commission.findMany({
//     where: { commissionId: { in: commissionIds } },
//     include: {
//       user: {
//         select: { userId: true, companyId: true, name: true },
//       },
//     },
//   });

//   const errors: string[] = [];

//   for (const commission of commissions) {
//     if (commission.user.companyId !== reviewer.companyId) {
//       errors.push(
//         `${commission.commissionId}: marketer does not belong to your company`,
//       );
//       continue;
//     }

//     if (commission.status !== CommissionStatus.PENDING) {
//       errors.push(
//         `${commission.commissionId}: status is ${commission.status}, expected PENDING`,
//       );
//     }
//   }

//   const foundIds = new Set(commissions.map((c) => c.commissionId));
//   for (const id of commissionIds) {
//     if (!foundIds.has(id)) {
//       errors.push(`${id}: not found`);
//     }
//   }

//   if (errors.length > 0) {
//     throw new BadRequestError(
//       `Commission review validation failed:\n${errors.join("\n")}`,
//     );
//   }

//   const targetStatus =
//     action === "APPROVE"
//       ? CommissionStatus.APPROVED
//       : CommissionStatus.FROZEN;

//   await prisma.commission.updateMany({
//     where: { commissionId: { in: commissionIds } },
//     data: { status: targetStatus },
//   });

//   return {
//     reviewed: commissions.length,
//     action,
//     status: targetStatus,
//   };
// }

// static async initiateTransfer(payoutId: string, companyUserId: string) {
//   const initiator = await prisma.user.findUnique({
//     where: { userId: companyUserId },
//   });

//   if (!initiator || initiator.role !== Role.COMPANY) {
//     throw new ForbiddenError("Only company accounts can initiate transfers");
//   }

//   const payout = await prisma.commissionPayoutRequest.findUnique({
//     where: { payoutId },
//     include: { user: true, marketerBankAccount: true },
//   });

//   if (!payout) {
//     throw new NotFoundError("Payout request not found");
//   }

//   if (payout.companyId !== initiator.companyId) {
//     throw new ForbiddenError("This payout does not belong to your company");
//   }

//   if (payout.status !== CommissionPayoutStatus.APPROVED) {
//     throw new BadRequestError(
//       `Payout must be APPROVED before a transfer can be initiated. Current status: ${payout.status}`,
//     );
//   }

//   const targetAccountId = await prisma.marketerBankAccount.findFirst({
//     where: { userId: payout.userId, isPrimary: true },
//     select: { id: true },
//   });

//   if (!targetAccountId) {
//     throw new BadRequestError(
//       "Marketer has no primary bank account. Please specify a bankAccountId or ask the marketer to add a primary account.",
//     );
//   }

//   const maskedAccountNumber = payout.marketerBankAccount?.accountNumber
//     ? maskAccountNumber(payout.marketerBankAccount.accountNumber)
//     : "";

//   await prisma.commissionPayoutRequest.update({
//     where: { payoutId },
//     data: {
//       status: CommissionPayoutStatus.TRANSFER_INITIATED,
//       marketerBankAccountId: targetAccountId.id,
//       transferInitiatedAt: new Date(),
//       transferInitiatedById: companyUserId,
//     },
//   });

//   emitEvent(DomainEvent.COMMISSION_TRANSFER_INITIATED, {
//     payoutId,
//     marketerId: payout.userId,
//     marketerName: payout.user.name ?? "MARKETER",
//     marketerEmail: payout.user.email,
//     amount: Number(payout.amount),
//     bankName: payout.marketerBankAccount?.bankName ?? "BANK",
//     maskedAccount: maskedAccountNumber,
//     dashboard_url: process.env.FRONTEND_URL,
//   });

//   await transferQueue.add(
//     "process-transfer",
//     { payoutId, initiatedByUserId: companyUserId },
//     { jobId: `transfer:${payoutId}` },
//   );

//   return { queued: true, payoutId };
// }

// static async initiateBulkTransfer(
//   payoutIds: string[],
//   companyUserId: string,
// ) {
//   if (!payoutIds.length) {
//     throw new BadRequestError("payoutIds must not be empty");
//   }

//   const initiator = await prisma.user.findUnique({
//     where: { userId: companyUserId },
//   });

//   if (!initiator || initiator.role !== Role.COMPANY) {
//     throw new ForbiddenError("Only company accounts can initiate transfers");
//   }

//   const payouts = await prisma.commissionPayoutRequest.findMany({
//     where: { payoutId: { in: payoutIds } },
//     include: {
//       user: {
//         include: { marketerBankAccounts: { where: { isPrimary: true } } },
//       },
//     },
//   });

//   const errors: string[] = [];

//   for (const payoutId of payoutIds) {
//     const payout = payouts.find((p) => p.payoutId === payoutId);

//     if (!payout) {
//       errors.push(`${payoutId}: not found`);
//       continue;
//     }

//     if (payout.companyId !== initiator.companyId) {
//       errors.push(`${payoutId}: does not belong to your company`);
//       continue;
//     }

//     if (payout.status !== CommissionPayoutStatus.APPROVED) {
//       errors.push(
//         `${payoutId}: status is ${payout.status}, expected APPROVED`,
//       );
//       continue;
//     }

//     const hasBankAccount = payout.user.marketerBankAccounts.length > 0;

//     if (!hasBankAccount) {
//       errors.push(
//         `${payoutId}: marketer ${payout.userId} has no primary bank account`,
//       );
//     }
//   }

//   if (errors.length > 0) {
//     throw new BadRequestError(
//       `Bulk transfer validation failed:\n${errors.join("\n")}`,
//     );
//   }

//   const results: Array<{ payoutId: string; queued: boolean }> = [];

//   await prisma.$transaction(async (tx) => {
//     for (const payout of payouts) {
//       const targetAccountId = payout.user.marketerBankAccounts.find(
//         (a) => a.isPrimary,
//       )?.id;

//       await tx.commissionPayoutRequest.update({
//         where: { payoutId: payout.payoutId },
//         data: {
//           status: CommissionPayoutStatus.TRANSFER_INITIATED,
//           marketerBankAccountId: targetAccountId,
//           transferInitiatedAt: new Date(),
//           transferInitiatedById: companyUserId,
//         },
//       });
//     }
//   });

//   for (const payout of payouts) {
//     await transferQueue.add(
//       "process-transfer",
//       { payoutId: payout.payoutId, initiatedByUserId: companyUserId },
//       { jobId: `transfer:${payout.payoutId}` },
//     );

//     results.push({ payoutId: payout.payoutId, queued: true });
//   }

//   return { total: results.length, results };
// }
// static async requestPayout(userId: string, amount: number) {
//   const user = await prisma.user.findUnique({
//     where: {
//       userId,
//     },
//   });

//   if (!user) {
//     throw new NotFoundError("User not found");
//   }

//   if (!user.companyId) {
//     throw new BadRequestError("User has no associated company");
//   }

//   const activeCommissions = await prisma.commission.findMany({
//     where: {
//       userId,
//       status: CommissionStatus.ACTIVE,
//     },
//   });

//   const totalAvailable = activeCommissions.reduce(
//     (acc, item) => acc.plus(item.amount),
//     new Prisma.Decimal(0),
//   );

//   if (totalAvailable.lessThan(amount)) {
//     throw new BadRequestError("Insufficient approved commissions balance");
//   }

//   const existingPending = await prisma.commissionPayoutRequest.findFirst({
//     where: {
//       userId,
//       status: {
//         in: [
//           CommissionPayoutStatus.PENDING_ADMIN_APPROVAL,
//           CommissionPayoutStatus.PENDING_COMPANY_APPROVAL,
//           CommissionPayoutStatus.TRANSFER_INITIATED,
//         ],
//       },
//     },
//   });

//   if (existingPending) {
//     throw new BadRequestError("You already have a pending payout request");
//   }

//   const request = await prisma.commissionPayoutRequest.create({
//     data: {
//       userId,
//       companyId: user.companyId,
//       amount: new Prisma.Decimal(amount),
//     },
//   });

//   await NotificationOrchestrator.handle(
//     NotificationEventType.COMMISSION_TRANSFER_REQUEST,
//     {
//       requestId: request.payoutId,
//       marketerName: user.name ?? "",
//       amount: formatCurrency(amount),
//     },
//   );

//   return request;
// }
