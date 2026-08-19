import {
  prisma,
  Prisma,
  FinancingStatus,
  InstallmentStatus,
  MerchantSettlementStatus,
} from "@/infrastructure/prisma";
import { NotFoundError } from "@/shared/utils/AppError";
import { AnalyticsService } from "@/core/services/analytics.service";

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return Number(value);
}

const ACTIVE_OR_COMPLETED = [
  FinancingStatus.ACTIVE,
  FinancingStatus.COMPLETED,
];

export class PlatformRevenueService {
  /**
   * Platform (SaaS) revenue earned from one tenant, itemized — kept
   * deliberately separate from the tenant's own GMV, which is a different
   * number (money flowing through their products, not money paid to us).
   */
  static async getTenantRevenue(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { companyId },
      select: { companyId: true, name: true, plan: true },
    });
    if (!company) throw new NotFoundError("Tenant not found.");

    const platformRevenueAccount = await prisma.ledgerAccount.findFirst({
      where: { name: "PLATFORM_REVENUE", companyId },
    });

    const transactions = platformRevenueAccount
      ? await prisma.journalEntry.findMany({
          where: { ledgerAccountId: platformRevenueAccount.id },
          include: {
            transaction: {
              select: { reference: true, description: true, createdAt: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];

    const [financingStats, collectedRes, settlementPaidRes] =
      await Promise.all([
        AnalyticsService.getFinancingStats({ companyId }),
        prisma.installment.aggregate({
          where: {
            status: InstallmentStatus.PAID,
            financingContract: { product: { companyId } },
          },
          _sum: { amount: true },
        }),
        prisma.merchantSettlementRequest.aggregate({
          where: {
            companyId,
            status: MerchantSettlementStatus.TRANSFER_SUCCESS,
          },
          _sum: { amount: true },
        }),
      ]);

    return {
      tenant: company,
      platformRevenue: {
        total: toNumber(platformRevenueAccount?.balance),
        transactions: transactions.map((t) => ({
          reference: t.transaction.reference,
          description: t.transaction.description,
          amount: toNumber(t.credit),
          occurredAt: t.createdAt,
        })),
      },
      tenantGmv: {
        totalFinanced: financingStats.totalValue,
        totalCollected: toNumber(collectedRes._sum.amount),
        activeContracts: financingStats.activeContracts,
        completedContracts: financingStats.completedContracts,
      },
      merchantSettlements: {
        totalPaidOut: toNumber(settlementPaidRes._sum.amount),
      },
    };
  }

  /**
   * Every tenant ranked by platform revenue. `LedgerAccount.balance` is
   * updated transactionally on every ledger write (see ledger.service.ts),
   * so sorting/paginating directly on it is safe and avoids computing
   * revenue for every tenant just to sort a page. GMV has no equivalent
   * stored aggregate, so it's computed only for the current page.
   */
  static async getTenantRevenueLeaderboard(query: {
    page: number;
    limit: number;
    sortOrder?: "asc" | "desc";
  }) {
    const { page, limit, sortOrder = "desc" } = query;
    const skip = (page - 1) * limit;

    const [accounts, total] = await Promise.all([
      prisma.ledgerAccount.findMany({
        where: { name: "PLATFORM_REVENUE", companyId: { not: null } },
        include: {
          company: { select: { companyId: true, name: true, plan: true } },
        },
        orderBy: { balance: sortOrder },
        skip,
        take: limit,
      }),
      prisma.ledgerAccount.count({
        where: { name: "PLATFORM_REVENUE", companyId: { not: null } },
      }),
    ]);

    const tenants = await Promise.all(
      accounts.map(async (account) => {
        const gmvRes = await prisma.financingContract.aggregate({
          where: { product: { companyId: account.companyId! } },
          _sum: { totalFinanced: true },
        });
        return {
          companyId: account.companyId,
          name: account.company?.name,
          plan: account.company?.plan,
          platformRevenue: toNumber(account.balance),
          gmv: toNumber(gmvRes._sum.totalFinanced),
        };
      }),
    );

    return {
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      tenants,
    };
  }

  /**
   * Cross-tenant product performance, ranked by GMV via a DB-level groupBy
   * (real sort/pagination, unlike the per-company `getProductPerformance` in
   * analytics.service.ts, which has no cross-tenant ranking need).
   */
  static async getProductRevenueLeaderboard(query: {
    page: number;
    limit: number;
  }) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [grouped, totalDistinct] = await Promise.all([
      prisma.financingContract.groupBy({
        by: ["productId"],
        where: { status: { in: ACTIVE_OR_COMPLETED } },
        _sum: { totalFinanced: true },
        _count: { _all: true },
        orderBy: { _sum: { totalFinanced: "desc" } },
        skip,
        take: limit,
      }),
      prisma.product.count({
        where: {
          financingContracts: { some: { status: { in: ACTIVE_OR_COMPLETED } } },
        },
      }),
    ]);

    const productIds = grouped.map((g) => g.productId);
    const products = await prisma.product.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        name: true,
        slug: true,
        status: true,
        price: true,
        commissionRate: true,
        company: { select: { companyId: true, name: true } },
      },
    });
    const productMap = new Map(products.map((p) => [p.productId, p]));

    const rows = await Promise.all(
      grouped.map(async (g) => {
        const product = productMap.get(g.productId);
        const commissionRes = await prisma.commission.aggregate({
          where: {
            payment: {
              installment: { financingContract: { productId: g.productId } },
            },
          },
          _sum: { amount: true },
        });

        return {
          productId: g.productId,
          name: product?.name,
          slug: product?.slug,
          company: product?.company,
          status: product?.status,
          contractsCount: g._count._all,
          totalFinanced: toNumber(g._sum.totalFinanced),
          commissionsPaid: toNumber(commissionRes._sum.amount),
        };
      }),
    );

    return {
      pagination: {
        total: totalDistinct,
        page,
        limit,
        totalPages: Math.ceil(totalDistinct / limit),
      },
      products: rows,
    };
  }

  static async getPlatformOverview() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      tenantsByPlan,
      platformRevenueTotalRes,
      platformRevenueThisMonthRes,
      gmvTotalRes,
      activeContractsCount,
      topTenants,
      topProductsGrouped,
    ] = await Promise.all([
      prisma.company.groupBy({ by: ["plan"], _count: { _all: true } }),
      prisma.ledgerAccount.aggregate({
        where: { name: "PLATFORM_REVENUE", companyId: { not: null } },
        _sum: { balance: true },
      }),
      prisma.journalEntry.aggregate({
        where: {
          account: { name: "PLATFORM_REVENUE", companyId: { not: null } },
          createdAt: { gte: startOfMonth },
        },
        _sum: { credit: true },
      }),
      prisma.financingContract.aggregate({ _sum: { totalFinanced: true } }),
      prisma.financingContract.count({
        where: { status: FinancingStatus.ACTIVE },
      }),
      prisma.ledgerAccount.findMany({
        where: { name: "PLATFORM_REVENUE", companyId: { not: null } },
        include: { company: { select: { companyId: true, name: true } } },
        orderBy: { balance: "desc" },
        take: 5,
      }),
      prisma.financingContract.groupBy({
        by: ["productId"],
        where: { status: { in: ACTIVE_OR_COMPLETED } },
        _sum: { totalFinanced: true },
        orderBy: { _sum: { totalFinanced: "desc" } },
        take: 5,
      }),
    ]);

    const topProductIds = topProductsGrouped.map((g) => g.productId);
    const topProductDetails = await prisma.product.findMany({
      where: { productId: { in: topProductIds } },
      select: {
        productId: true,
        name: true,
        company: { select: { companyId: true, name: true } },
      },
    });
    const topProductMap = new Map(topProductDetails.map((p) => [p.productId, p]));

    return {
      tenants: {
        total: tenantsByPlan.reduce((acc, row) => acc + row._count._all, 0),
        byPlan: Object.fromEntries(
          tenantsByPlan.map((row) => [row.plan, row._count._all]),
        ),
      },
      platformRevenue: {
        allTime: toNumber(platformRevenueTotalRes._sum.balance),
        thisMonth: toNumber(platformRevenueThisMonthRes._sum.credit),
      },
      gmv: {
        total: toNumber(gmvTotalRes._sum.totalFinanced),
        activeContracts: activeContractsCount,
      },
      topTenantsByRevenue: topTenants.map((t) => ({
        companyId: t.companyId,
        name: t.company?.name,
        platformRevenue: toNumber(t.balance),
      })),
      topProductsByGmv: topProductsGrouped.map((g) => {
        const product = topProductMap.get(g.productId);
        return {
          productId: g.productId,
          name: product?.name,
          company: product?.company,
          totalFinanced: toNumber(g._sum.totalFinanced),
        };
      }),
    };
  }
}
