import {
  prisma,
  Prisma,
  Role,
  FinancingStatus,
  InstallmentStatus,
  KycApplicationStatus,
  CommissionStatus,
  CommissionPayoutStatus,
  ProductStatus,
  InternalNotificationStatus,
} from "@/infrastructure/prisma";

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toNumber?: () => number }).toNumber === "function"
  )
    return (value as { toNumber: () => number }).toNumber();
  return Number(value);
}

function sumField(items: Record<string, unknown>[], field: string): number {
  return items.reduce((acc, item) => acc + toNumber(item[field]), 0);
}

export class AnalyticsService {
  // ─── COMPANY OVERVIEW ───
  static async getCompanyOverview(companyId: string) {
    const [
      totalFinancedRes,
      totalPaidRes,
      activeContractsRes,
      defaultedContractsRes,
      pendingApprovalsRes,
      payoutPipelineRes,
      unreadNotificationsRes,
      companyRes,
      recentContractsRes,
    ] = await Promise.all([
      prisma.financingContract.aggregate({
        where: {
          product: { companyId },
          status: {
            in: [
              FinancingStatus.ACTIVE,
              FinancingStatus.PENDING_ACTIVATION,
              FinancingStatus.RESTRUCTURED,
            ],
          },
        },
        _sum: { totalFinanced: true },
      }),
      prisma.installment.aggregate({
        where: {
          status: InstallmentStatus.PAID,
          financingContract: { product: { companyId } },
        },
        _sum: { amount: true },
      }),
      prisma.financingContract.count({
        where: {
          product: { companyId },
          status: FinancingStatus.ACTIVE,
        },
      }),
      prisma.financingContract.count({
        where: {
          product: { companyId },
          status: {
            in: [FinancingStatus.DEFAULTED, FinancingStatus.WRITTEN_OFF],
          },
        },
      }),
      prisma.kycApplication.count({
        where: {
          status: KycApplicationStatus.APPROVAL_PROCESSING,
          onboardingSession: { companyId },
        },
      }),
      prisma.commissionPayoutRequest.groupBy({
        by: ["status"],
        where: { companyId },
        _sum: { amount: true },
      }),
      prisma.internalNotification.count({
        where: {
          NOT: {
            userId: "",
          },
          status: InternalNotificationStatus.UNREAD,
        },
      }),
      prisma.company.findUnique({
        where: { companyId },
        include: {
          subscriptions: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.financingContract.findMany({
        where: { product: { companyId } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: { select: { name: true, email: true } },
          product: { select: { name: true, slug: true } },
          installments: {
            where: { status: InstallmentStatus.PAID },
            select: { amount: true },
          },
        },
      }),
    ]);

    const totalFinanced = toNumber(totalFinancedRes._sum.totalFinanced);
    const totalPaid = toNumber(totalPaidRes._sum.amount);
    const outstandingBalance = totalFinanced - totalPaid;

    const payoutValues: Record<string, number> = {};
    for (const row of payoutPipelineRes) {
      payoutValues[row.status] = toNumber(row._sum.amount);
    }

    const collectionRate =
      totalFinanced > 0
        ? Number(((totalPaid / totalFinanced) * 100).toFixed(2))
        : 0;

    return {
      financials: {
        totalFinanced,
        totalPaid,
        outstandingBalance,
        collectionRate,
      },
      contracts: {
        active: activeContractsRes,
        defaulted: defaultedContractsRes,
      },
      kyc: {
        pendingApprovals: pendingApprovalsRes,
      },
      payouts: {
        pipeline: payoutValues,
        pendingAdmin:
          payoutValues[CommissionPayoutStatus.PENDING_ADMIN_APPROVAL] || 0,
        pendingCompany:
          payoutValues[CommissionPayoutStatus.PENDING_COMPANY_APPROVAL] || 0,
        approved: payoutValues[CommissionPayoutStatus.APPROVED] || 0,
        transferInitiated:
          payoutValues[CommissionPayoutStatus.TRANSFER_INITIATED] || 0,
        paid: payoutValues[CommissionPayoutStatus.PAID] || 0,
        failed:
          (payoutValues[CommissionPayoutStatus.TRANSFER_FAILED] || 0) +
          (payoutValues[CommissionPayoutStatus.TRANSFER_REVERSED] || 0),
      },
      notifications: {
        unread: unreadNotificationsRes,
      },
      subscription: companyRes?.subscriptions?.[0] || null,
      recentContracts: recentContractsRes.map((c) => ({
        contractId: c.contractId,
        customer: c.user,
        product: c.product,
        totalFinanced: toNumber(c.totalFinanced),
        status: c.status,
        paidAmount: sumField(c.installments, "amount"),
        createdAt: c.createdAt,
      })),
    };
  }

  // ─── ADMIN OVERVIEW ───
  static async getAdminOverview(adminId: string) {
    const [
      myMarketersRes,
      myMarketersReferralsRes,
      myPendingApprovalsRes,
      myRevenueRes,
      myApprovalRequestsRes,
      recentKycRes,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          role: Role.MARKETER,
          createdById: adminId,
          active: true,
        },
      }),
      prisma.user.count({
        where: {
          role: Role.CUSTOMER,
          referredByMarketer: { createdById: adminId },
        },
      }),
      prisma.kycApplication.count({
        where: {
          status: KycApplicationStatus.APPROVAL_PROCESSING,
          onboardingSession: {
            marketer: { createdById: adminId },
          },
        },
      }),
      prisma.financingContract.aggregate({
        where: {
          status: FinancingStatus.ACTIVE,
          user: { referredByMarketer: { createdById: adminId } },
        },
        _sum: { totalFinanced: true },
      }),
      prisma.approvalRequest.count({
        where: {
          targetUserId: adminId,
          status: "PENDING",
        },
      }),
      prisma.kycApplication.findMany({
        where: {
          status: KycApplicationStatus.APPROVAL_PROCESSING,
          onboardingSession: { marketer: { createdById: adminId } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          product: { select: { name: true, slug: true } },
          onboardingSession: {
            include: {
              marketer: {
                select: { name: true, email: true, referralCode: true },
              },
            },
          },
        },
      }),
    ]);

    const totalRevenue = toNumber(myRevenueRes._sum.totalFinanced);

    return {
      marketers: {
        total: myMarketersRes,
        totalReferrals: myMarketersReferralsRes,
      },
      kyc: {
        pendingApprovals: myPendingApprovalsRes,
        recentApplications: recentKycRes,
      },
      financials: {
        totalRevenue,
      },
      approvals: {
        pendingRequests: myApprovalRequestsRes,
      },
    };
  }

  // ─── MARKETER OVERVIEW ───
  static async getMarketerOverview(marketerId: string) {
    const [
      allTimeCommissionsRes,
      availableBalanceRes,
      pendingPayoutRes,
      paidPayoutRes,
      activeReferralsRes,
      pendingAppsRes,
      approvedContractsRes,
      commissionsByProductRes,
      commissionsByCustomerRes,
      unreadNotificationsRes,
    ] = await Promise.all([
      prisma.commission.aggregate({
        where: { userId: marketerId },
        _sum: { amount: true },
      }),
      prisma.commission.aggregate({
        where: {
          userId: marketerId,
          status: { notIn: [CommissionStatus.PAID, CommissionStatus.FROZEN] },
        },
        _sum: { amount: true, reservedAmount: true },
      }),
      prisma.commissionPayoutRequest.aggregate({
        where: {
          userId: marketerId,
          status: {
            in: [
              CommissionPayoutStatus.PENDING_ADMIN_APPROVAL,
              CommissionPayoutStatus.PENDING_COMPANY_APPROVAL,
              CommissionPayoutStatus.APPROVED,
              CommissionPayoutStatus.TRANSFER_INITIATED,
            ],
          },
        },
        _sum: { amount: true },
      }),
      prisma.commissionPayoutRequest.aggregate({
        where: {
          userId: marketerId,
          status: CommissionPayoutStatus.PAID,
        },
        _sum: { amount: true },
      }),
      prisma.user.count({
        where: {
          role: Role.CUSTOMER,
          referredByMarketerId: marketerId,
        },
      }),
      prisma.kycApplication.count({
        where: {
          status: {
            in: [
              KycApplicationStatus.PENDING,
              KycApplicationStatus.APPROVAL_PROCESSING,
            ],
          },
          onboardingSession: { marketerId },
        },
      }),
      prisma.financingContract.count({
        where: {
          user: { referredByMarketerId: marketerId },
          status: FinancingStatus.ACTIVE,
        },
      }),
      prisma.commission.findMany({
        where: { userId: marketerId },
        include: {
          payment: {
            include: {
              installment: {
                include: {
                  financingContract: {
                    include: {
                      product: { select: { productId: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.commission.findMany({
        where: { userId: marketerId },
        include: {
          payment: {
            include: {
              installment: {
                include: {
                  financingContract: {
                    include: {
                      user: {
                        select: { userId: true, name: true, email: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.internalNotification.count({
        where: {
          userId: marketerId,
          status: InternalNotificationStatus.UNREAD,
        },
      }),
    ]);

    const totalCommissions = toNumber(allTimeCommissionsRes._sum.amount);
    const totalReserved = toNumber(availableBalanceRes._sum.reservedAmount);
    const totalAvailableAmount = toNumber(availableBalanceRes._sum.amount);
    const availableBalance = totalAvailableAmount - totalReserved;
    const pendingPayout = toNumber(pendingPayoutRes._sum.amount);
    const paidPayout = toNumber(paidPayoutRes._sum.amount);

    const productMap = new Map<
      string,
      { productId: string; productName: string; total: number }
    >();
    for (const c of commissionsByProductRes) {
      const product = c.payment?.installment?.financingContract?.product;
      if (!product) continue;
      const key = product.productId;
      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: product.productId,
          productName: product.name,
          total: 0,
        });
      }
      productMap.get(key)!.total += toNumber(c.amount);
    }

    const customerMap = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        customerEmail: string;
        total: number;
      }
    >();
    for (const c of commissionsByCustomerRes) {
      const user = c.payment?.installment?.financingContract?.user;
      if (!user) continue;
      const key = user.userId;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customerId: user.userId,
          customerName: user.name || "",
          customerEmail: user.email,
          total: 0,
        });
      }
      customerMap.get(key)!.total += toNumber(c.amount);
    }

    return {
      commissions: {
        total: totalCommissions,
        available: availableBalance,
        pendingPayout,
        paidPayout,
      },
      referrals: {
        active: activeReferralsRes,
        pendingApplications: pendingAppsRes,
        approvedContracts: approvedContractsRes,
      },
      breakdown: {
        byProduct: Array.from(productMap.values()),
        byCustomer: Array.from(customerMap.values()),
      },
      notifications: {
        unread: unreadNotificationsRes,
      },
    };
  }

  // ─── CUSTOMER OVERVIEW ───
  static async getCustomerOverview(customerId: string) {
    const [
      activeContractsRes,
      totalFinancedRes,
      totalPaidRes,
      nextInstallmentRes,
      overdueInstallmentsRes,
      customerRes,
    ] = await Promise.all([
      prisma.financingContract.findMany({
        where: {
          userId: customerId,
          status: {
            in: [
              FinancingStatus.ACTIVE,
              FinancingStatus.PENDING_ACTIVATION,
              FinancingStatus.RESTRUCTURED,
            ],
          },
        },
        select: {
          contractId: true,
          totalFinanced: true,
          status: true,
          kycApplication: {
            include: {
              product: {
                select: {
                  productId: true,
                  name: true,
                  slug: true,
                  images: { select: { imageUrl: true }, take: 1 },
                },
              },
            },
          },
          installments: {
            where: { status: InstallmentStatus.PAID },
            select: { amount: true },
          },
        },
      }),
      prisma.financingContract.aggregate({
        where: {
          userId: customerId,
          status: {
            in: [
              FinancingStatus.ACTIVE,
              FinancingStatus.PENDING_ACTIVATION,
              FinancingStatus.RESTRUCTURED,
            ],
          },
        },
        _sum: { totalFinanced: true },
      }),
      prisma.installment.aggregate({
        where: {
          status: InstallmentStatus.PAID,
          financingContract: { userId: customerId },
        },
        _sum: { amount: true },
      }),
      prisma.installment.findFirst({
        where: {
          status: { in: [InstallmentStatus.PENDING, InstallmentStatus.DUE] },
          financingContract: { userId: customerId },
        },
        orderBy: { dueDate: "asc" },
        select: {
          installmentId: true,
          amount: true,
          dueDate: true,
          financingContract: {
            select: {
              contractId: true,
              kycApplication: {
                include: {
                  product: { select: { name: true, slug: true } },
                },
              },
            },
          },
        },
      }),
      prisma.installment.aggregate({
        where: {
          status: {
            in: [InstallmentStatus.OVERDUE, InstallmentStatus.DEFAULTED],
          },
          financingContract: { userId: customerId },
        },
        _sum: { amount: true },
      }),
      prisma.user.findUnique({
        where: { userId: customerId },
        select: {
          name: true,
          email: true,
          referredByMarketer: {
            select: { name: true, email: true, referralCode: true },
          },
        },
      }),
    ]);

    const totalFinanced = toNumber(totalFinancedRes._sum.totalFinanced);
    const totalPaid = toNumber(totalPaidRes._sum.amount);
    const remainingBalance = totalFinanced - totalPaid;
    const overallProgress =
      totalFinanced > 0
        ? Number(((totalPaid / totalFinanced) * 100).toFixed(2))
        : 0;
    const overdueAmount = toNumber(overdueInstallmentsRes._sum.amount);

    const contracts = activeContractsRes.map((c) => ({
      contractId: c.contractId,
      product: c.kycApplication.product,
      totalFinanced: toNumber(c.totalFinanced),
      paidAmount: sumField(c.installments, "amount"),
      status: c.status,
    }));

    const nextPayment = nextInstallmentRes
      ? {
          installmentId: nextInstallmentRes.installmentId,
          amount: toNumber(nextInstallmentRes.amount),
          dueDate: nextInstallmentRes.dueDate,
          product: nextInstallmentRes.financingContract.kycApplication.product,
        }
      : null;

    return {
      summary: {
        activeContracts: activeContractsRes.length,
        totalFinanced,
        totalPaid,
        remainingBalance,
        overallProgress,
        overdueAmount,
      },
      nextPayment,
      contracts,
      referredBy: customerRes?.referredByMarketer || null,
    };
  }

  // ─── SHARED: Financing Stats ───
  static async getFinancingStats(scope: {
    companyId?: string;
    adminId?: string;
    marketerId?: string;
    customerId?: string;
  }) {
    const where: Prisma.FinancingContractWhereInput = {};

    if (scope.companyId) {
      where.product = { companyId: scope.companyId };
    } else if (scope.adminId) {
      where.user = { referredByMarketer: { createdById: scope.adminId } };
    } else if (scope.marketerId) {
      where.user = { referredByMarketerId: scope.marketerId };
    } else if (scope.customerId) {
      where.userId = scope.customerId;
    }

    const [
      totalContracts,
      activeContracts,
      completedContracts,
      defaultedContracts,
      writtenOffContracts,
      totalValue,
      activeValue,
      avgDuration,
    ] = await Promise.all([
      prisma.financingContract.count({ where }),
      prisma.financingContract.count({
        where: { ...where, status: FinancingStatus.ACTIVE },
      }),
      prisma.financingContract.count({
        where: { ...where, status: FinancingStatus.COMPLETED },
      }),
      prisma.financingContract.count({
        where: { ...where, status: FinancingStatus.DEFAULTED },
      }),
      prisma.financingContract.count({
        where: { ...where, status: FinancingStatus.WRITTEN_OFF },
      }),
      prisma.financingContract.aggregate({
        where,
        _sum: { totalFinanced: true },
      }),
      prisma.financingContract.aggregate({
        where: { ...where, status: FinancingStatus.ACTIVE },
        _sum: { totalFinanced: true },
      }),
      prisma.financingContract.aggregate({
        where: { ...where, status: FinancingStatus.COMPLETED },
        _avg: { approvedDurationMonths: true },
      }),
    ]);

    return {
      totalContracts,
      activeContracts,
      completedContracts,
      defaultedContracts,
      writtenOffContracts,
      totalValue: toNumber(totalValue._sum.totalFinanced),
      activeValue: toNumber(activeValue._sum.totalFinanced),
      avgDurationMonths: toNumber(avgDuration._avg.approvedDurationMonths),
      defaultRate:
        totalContracts > 0
          ? Number(
              ((defaultedContracts + writtenOffContracts) / totalContracts) *
                100,
            ).toFixed(2)
          : 0,
    };
  }

  // ─── SHARED: KYC Funnel Stats ───
  static async getKycFunnelStats(scope: {
    companyId?: string;
    adminId?: string;
    marketerId?: string;
  }) {
    const baseWhere: Prisma.KycApplicationWhereInput = {};
    if (scope.companyId) {
      baseWhere.onboardingSession = { companyId: scope.companyId };
    } else if (scope.adminId) {
      baseWhere.onboardingSession = {
        marketer: { createdById: scope.adminId },
      };
    } else if (scope.marketerId) {
      baseWhere.onboardingSession = { marketerId: scope.marketerId };
    }

    const [total, pending, processing, approved, rejected] = await Promise.all([
      prisma.kycApplication.count({ where: baseWhere }),
      prisma.kycApplication.count({
        where: { ...baseWhere, status: KycApplicationStatus.PENDING },
      }),
      prisma.kycApplication.count({
        where: {
          ...baseWhere,
          status: KycApplicationStatus.APPROVAL_PROCESSING,
        },
      }),
      prisma.kycApplication.count({
        where: { ...baseWhere, status: KycApplicationStatus.APPROVED },
      }),
      prisma.kycApplication.count({
        where: { ...baseWhere, status: KycApplicationStatus.REJECTED },
      }),
    ]);

    const approvalRate =
      total > 0 ? Number(((approved + rejected) / total) * 100).toFixed(2) : 0;

    return {
      total,
      pending,
      processing,
      approved,
      rejected,
      approvalRate,
    };
  }

  // ─── SHARED: Payment Collection Stats ───
  static async getCollectionStats(companyId: string) {
    const [
      totalInstallments,
      paidInstallments,
      pendingInstallments,
      dueInstallments,
      overdueInstallments,
      defaultedInstallments,
      totalDue,
      totalPaid,
      totalOverdue,
    ] = await Promise.all([
      prisma.installment.count({
        where: { financingContract: { product: { companyId } } },
      }),
      prisma.installment.count({
        where: {
          status: InstallmentStatus.PAID,
          financingContract: { product: { companyId } },
        },
      }),
      prisma.installment.count({
        where: {
          status: InstallmentStatus.PENDING,
          financingContract: { product: { companyId } },
        },
      }),
      prisma.installment.count({
        where: {
          status: InstallmentStatus.DUE,
          financingContract: { product: { companyId } },
        },
      }),
      prisma.installment.count({
        where: {
          status: InstallmentStatus.OVERDUE,
          financingContract: { product: { companyId } },
        },
      }),
      prisma.installment.count({
        where: {
          status: InstallmentStatus.DEFAULTED,
          financingContract: { product: { companyId } },
        },
      }),
      prisma.installment.aggregate({
        where: { financingContract: { product: { companyId } } },
        _sum: { amount: true },
      }),
      prisma.installment.aggregate({
        where: {
          status: InstallmentStatus.PAID,
          financingContract: { product: { companyId } },
        },
        _sum: { amount: true },
      }),
      prisma.installment.aggregate({
        where: {
          status: {
            in: [InstallmentStatus.OVERDUE, InstallmentStatus.DEFAULTED],
          },
          financingContract: { product: { companyId } },
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalInstallments,
      paidInstallments,
      pendingInstallments,
      dueInstallments,
      overdueInstallments,
      defaultedInstallments,
      collectionRate:
        totalInstallments > 0
          ? Number(((paidInstallments / totalInstallments) * 100).toFixed(2))
          : 0,
      totalDue: toNumber(totalDue._sum.amount),
      totalPaid: toNumber(totalPaid._sum.amount),
      totalOverdue: toNumber(totalOverdue._sum.amount),
    };
  }

  // ─── SHARED: Product Performance ───
  static async getProductPerformance(scope: {
    companyId?: string;
    adminId?: string;
  }) {
    const where: Prisma.ProductWhereInput = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    } else if (scope.adminId) {
      where.company = {
        users: {
          some: {
            role: Role.MARKETER,
            createdById: scope.adminId,
          },
        },
      };
    }

    const products = await prisma.product.findMany({
      where: {
        ...where,
        status: { not: ProductStatus.ARCHIVED },
      },
      select: {
        productId: true,
        name: true,
        slug: true,
        status: true,
        price: true,
        commissionRate: true,
        _count: { select: { financingContracts: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const productStats = await Promise.all(
      products.map(async (product) => {
        const contractStats = await prisma.financingContract.aggregate({
          where: {
            productId: product.productId,
            status: { in: [FinancingStatus.ACTIVE, FinancingStatus.COMPLETED] },
          },
          _sum: { totalFinanced: true },
          _count: { _all: true },
        });

        const commissionStats = await prisma.commission.aggregate({
          where: {
            payment: {
              installment: {
                financingContract: { productId: product.productId },
              },
            },
          },
          _sum: { amount: true },
        });

        return {
          productId: product.productId,
          name: product.name,
          slug: product.slug,
          status: product.status,
          price: toNumber(product.price),
          commissionRate: toNumber(product.commissionRate),
          contractsCount: contractStats._count._all,
          totalFinanced: toNumber(contractStats._sum.totalFinanced),
          commissionsPaid: toNumber(commissionStats._sum.amount),
        };
      }),
    );

    return productStats;
  }
}
