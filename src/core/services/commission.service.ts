import {
  prisma,
  Prisma,
  CommissionStatus,
  Role,
  AccountType,
  CommissionPayoutStatus,
} from "@/infrastructure/prisma";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/shared/utils/AppError";
import { LedgerService } from "@/core/services/ledger.service";
import { NotificationOrchestrator } from "@/infrastructure/internal_notification/notification.orchestrator";
import { NotificationEventType } from "@/infrastructure/internal_notification/notification.types";
import { formatCurrency } from "@/shared/utils/helpers/misc";

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

  static async requestPayout(userId: string, amount: number) {
    const user = await prisma.user.findUnique({
      where: {
        userId,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!user.companyId) {
      throw new BadRequestError("User has no associated company");
    }

    const approvedCommissions = await prisma.commission.findMany({
      where: {
        userId,
        status: CommissionStatus.APPROVED,
      },
    });

    const totalAvailable = approvedCommissions.reduce(
      (acc, item) => acc.plus(item.amount),
      new Prisma.Decimal(0),
    );

    if (totalAvailable.lessThan(amount)) {
      throw new BadRequestError("Insufficient approved commissions balance");
    }

    const existingPending = await prisma.commissionPayoutRequest.findFirst({
      where: {
        userId,
        status: {
          in: [
            CommissionPayoutStatus.PENDING_ADMIN_APPROVAL,
            CommissionPayoutStatus.PENDING_COMPANY_APPROVAL,
          ],
        },
      },
    });

    if (existingPending) {
      throw new BadRequestError("You already have a pending payout request");
    }

    const request = await prisma.commissionPayoutRequest.create({
      data: {
        userId,
        companyId: user.companyId,
        amount: new Prisma.Decimal(amount),
      },
    });

    await NotificationOrchestrator.handle(
      NotificationEventType.COMMISSION_TRANSFER_REQUEST,
      {
        requestId: request.payoutId,
        marketerName: user.name ?? "",
        amount: formatCurrency(amount),
      },
    );

    return request;
  }

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
      },
    });

    if (!payout) {
      throw new NotFoundError("Payout request not found");
    }

    return prisma.commissionPayoutRequest.update({
      where: {
        payoutId,
      },

      data: {
        status: CommissionPayoutStatus.PENDING_COMPANY_APPROVAL,
        adminApprovedById: adminId,
        adminApprovedAt: new Date(),
      },
    });
  }

  static async companyApprovePayout(payoutId: string, companyUserId: string) {
    const approver = await prisma.user.findUnique({
      where: {
        userId: companyUserId,
      },
    });

    if (!approver || approver.role !== Role.COMPANY) {
      throw new ForbiddenError("Only company accounts can finalize payouts");
    }

    const payout = await prisma.commissionPayoutRequest.findUnique({
      where: {
        payoutId,
      },

      include: {
        user: true,
      },
    });

    if (!payout) {
      throw new NotFoundError("Payout request not found");
    }

    if (payout.status !== CommissionPayoutStatus.PENDING_COMPANY_APPROVAL) {
      throw new BadRequestError("Payout is not awaiting company approval");
    }

    await prisma.$transaction(async (tx) => {
      await tx.commissionPayoutRequest.update({
        where: {
          payoutId,
        },

        data: {
          status: CommissionPayoutStatus.PAID,
          companyApprovedById: companyUserId,
          companyApprovedAt: new Date(),
          paidAt: new Date(),
        },
      });

      await tx.commission.updateMany({
        where: {
          userId: payout.userId,
          status: CommissionStatus.APPROVED,
        },

        data: {
          status: CommissionStatus.PAID,
        },
      });

      await LedgerService.recordTransaction(
        {
          reference: `COMMISSION_PAYOUT_${payout.payoutId}`,

          description: `Commission payout to marketer ${payout.userId}`,

          companyId: payout.companyId,

          entries: [
            {
              accountName: "COMMISSION_PAYABLE",
              accountType: AccountType.LIABILITY,
              debit: payout.amount,
            },

            {
              accountName: "BANK",
              accountType: AccountType.ASSET,
              credit: payout.amount,
            },
          ],
        },

        tx,
      );
    });

    return {
      success: true,
    };
  }
}
