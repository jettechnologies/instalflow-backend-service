import { prisma, Prisma, CompanyStatus } from "@/infrastructure/prisma";
import { NotFoundError, BadRequestError } from "@/shared/utils/AppError";
import { AnalyticsService } from "@/core/services/analytics.service";

type ActivityEvent = {
  type: string;
  action: string;
  outcome: string | null;
  actor: { id?: string; name?: string; email?: string; role?: string } | null;
  details: string | null;
  occurredAt: Date;
  refId: string;
};

enum ActivityType {
  KYC = "kyc",
  SETTLEMENT = "settlement",
  APPROVAL = "approval",
  PAYOUT = "payout",
  CONTRACT = "contract",
  LOGIN = "login",
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return Number(value);
}

export class TenantManagementService {
  /** Platform (SaaS) revenue earned from this tenant + the tenant's own GMV — two distinct numbers, never summed together. */
  private static async getRevenueSnapshot(companyId: string) {
    const [platformRevenueAccount, gmvRes] = await Promise.all([
      prisma.ledgerAccount.findFirst({
        where: { name: "PLATFORM_REVENUE", companyId },
        select: { balance: true },
      }),
      prisma.financingContract.aggregate({
        where: { product: { companyId } },
        _sum: { totalFinanced: true },
      }),
    ]);

    return {
      platformRevenue: toNumber(platformRevenueAccount?.balance),
      gmv: toNumber(gmvRes._sum.totalFinanced),
    };
  }

  private static async getUsersByRole(companyId: string) {
    const rows = await prisma.user.groupBy({
      by: ["role"],
      where: { companyId },
      _count: { _all: true },
    });
    const usersByRole: Record<string, number> = {};
    for (const row of rows) usersByRole[row.role] = row._count._all;
    return usersByRole;
  }

  static async listTenants(query: {
    page: number;
    limit: number;
    search?: string;
  }) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CompanyWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {};

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          subscriptions: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { plan: { select: { name: true } } },
          },
          _count: { select: { users: true, products: true } },
        },
      }),
      prisma.company.count({ where }),
    ]);

    const tenants = await Promise.all(
      companies.map(async (company) => {
        const [revenue, usersByRole] = await Promise.all([
          this.getRevenueSnapshot(company.companyId),
          this.getUsersByRole(company.companyId),
        ]);

        return {
          companyId: company.companyId,
          name: company.name,
          plan: company.plan,
          status: company.status,
          activeSubscription: company.subscriptions[0]
            ? {
                planName: company.subscriptions[0].plan.name,
                status: company.subscriptions[0].status,
              }
            : null,
          productCount: company._count.products,
          totalUsers: company._count.users,
          usersByRole,
          ...revenue,
          createdAt: company.createdAt,
        };
      }),
    );

    return {
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      tenants,
    };
  }

  static async getTenantProfile(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { companyId },
      include: {
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { plan: { select: { name: true, interval: true } } },
        },
        bankAccounts: {
          select: {
            accountId: true,
            bankName: true,
            accountNumber: true,
            isPrimary: true,
            isVerified: true,
          },
        },
        _count: { select: { users: true, products: true } },
      },
    });

    if (!company) throw new NotFoundError("Tenant not found.");

    const [usersByRole, financingStats, kycFunnel, revenue] = await Promise.all(
      [
        this.getUsersByRole(companyId),
        AnalyticsService.getFinancingStats({ companyId }),
        AnalyticsService.getKycFunnelStats({ companyId }),
        this.getRevenueSnapshot(companyId),
      ],
    );

    return {
      companyId: company.companyId,
      name: company.name,
      plan: company.plan,
      status: company.status,
      suspendedAt: company.suspendedAt,
      suspendedReason: company.suspendedReason,
      logoUrl: company.logoUrl,
      publicSignupCode: company.publicSignupCode,
      createdAt: company.createdAt,
      subscriptionHistory: company.subscriptions.map((s) => ({
        subscriptionId: s.subscriptionId,
        planName: s.plan.name,
        interval: s.plan.interval,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
      })),
      bankAccounts: company.bankAccounts,
      productCount: company._count.products,
      totalUsers: company._count.users,
      usersByRole,
      financing: financingStats,
      kycFunnel,
      revenue,
    };
  }

  static async setTenantStatus(
    companyId: string,
    data: {
      status: CompanyStatus;
      reason?: string;
      performedById: string;
    },
  ) {
    const company = await prisma.company.findUnique({ where: { companyId } });
    if (!company) throw new NotFoundError("Tenant not found.");

    if (data.status === CompanyStatus.SUSPENDED && !data.reason) {
      throw new BadRequestError("A reason is required to suspend a tenant.");
    }

    const isSuspending = data.status === CompanyStatus.SUSPENDED;

    const updated = await prisma.company.update({
      where: { companyId },
      data: {
        status: data.status,
        suspendedAt: isSuspending ? new Date() : null,
        suspendedReason: isSuspending ? data.reason : null,
        suspendedById: isSuspending ? data.performedById : null,
      },
    });

    return {
      companyId: updated.companyId,
      name: updated.name,
      status: updated.status,
      suspendedAt: updated.suspendedAt,
      suspendedReason: updated.suspendedReason,
    };
  }

  static async getTenantActivity(
    companyId: string,
    query: {
      page: number;
      limit: number;
      type?: ActivityType;
      from?: Date;
      to?: Date;
    },
  ) {
    const company = await prisma.company.findUnique({
      where: { companyId },
      select: { companyId: true },
    });
    if (!company) throw new NotFoundError("Tenant not found.");

    const { page, limit, type, from, to } = query;
    const dateFilter = from || to ? { gte: from, lte: to } : undefined;
    const fanInTake = page * limit;

    const sources: Promise<ActivityEvent[]>[] = [];

    if (!type || type === "kyc") {
      sources.push(
        prisma.kycAuditTrail
          .findMany({
            where: {
              kycApplication: { onboardingSession: { companyId } },
              createdAt: dateFilter,
            },
            include: {
              performedBy: {
                select: { userId: true, name: true, email: true, role: true },
              },
            },
            orderBy: { createdAt: "desc" },
            take: fanInTake,
          })
          .then((rows) =>
            rows.map((r) => ({
              type: "KYC",
              action: r.action,
              outcome: r.outcome,
              actor: r.performedBy
                ? {
                    id: r.performedBy.userId,
                    name: r.performedBy.name ?? undefined,
                    email: r.performedBy.email,
                    role: r.performedBy.role,
                  }
                : null,
              details: r.details,
              occurredAt: r.createdAt,
              refId: r.auditId,
            })),
          ),
      );
    }

    if (!type || type === "settlement") {
      sources.push(
        prisma.merchantSettlementAuditTrail
          .findMany({
            where: { settlement: { companyId }, createdAt: dateFilter },
            include: {
              performedBy: {
                select: { userId: true, name: true, email: true, role: true },
              },
            },
            orderBy: { createdAt: "desc" },
            take: fanInTake,
          })
          .then((rows) =>
            rows.map((r) => ({
              type: "SETTLEMENT",
              action: r.action,
              outcome: r.outcome,
              actor: r.performedBy
                ? {
                    id: r.performedBy.userId,
                    name: r.performedBy.name ?? undefined,
                    email: r.performedBy.email,
                    role: r.performedBy.role,
                  }
                : { name: r.actorType },
              details: r.details,
              occurredAt: r.createdAt,
              refId: r.auditId,
            })),
          ),
      );
    }

    if (!type || type === "approval") {
      sources.push(
        prisma.approvalRequest
          .findMany({
            where: { companyId, createdAt: dateFilter },
            include: {
              requestedBy: {
                select: { userId: true, name: true, email: true, role: true },
              },
              targetUser: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
            take: fanInTake,
          })
          .then((rows) =>
            rows.map((r) => ({
              type: "APPROVAL_REQUEST",
              action: `${r.action} requested for ${r.targetUser.name ?? r.targetUser.email}`,
              outcome: r.status,
              actor: {
                id: r.requestedBy.userId,
                name: r.requestedBy.name ?? undefined,
                email: r.requestedBy.email,
                role: r.requestedBy.role,
              },
              details: r.reason,
              occurredAt: r.createdAt,
              refId: r.requestId,
            })),
          ),
      );
    }

    if (!type || type === "payout") {
      sources.push(
        prisma.commissionPayoutRequest
          .findMany({
            where: { companyId, updatedAt: dateFilter },
            include: {
              user: {
                select: { userId: true, name: true, email: true, role: true },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: fanInTake,
          })
          .then((rows) =>
            rows.map((r) => ({
              type: "COMMISSION_PAYOUT",
              action: `Payout ${r.status}`,
              outcome: r.status,
              actor: {
                id: r.user.userId,
                name: r.user.name ?? undefined,
                email: r.user.email,
                role: r.user.role,
              },
              details: `Amount: ${toNumber(r.amount)}`,
              occurredAt: r.updatedAt,
              refId: r.payoutId,
            })),
          ),
      );
    }

    if (!type || type === "contract") {
      sources.push(
        prisma.financingContract
          .findMany({
            where: { product: { companyId }, updatedAt: dateFilter },
            include: {
              user: {
                select: { userId: true, name: true, email: true, role: true },
              },
              product: { select: { name: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: fanInTake,
          })
          .then((rows) =>
            rows.map((r) => ({
              type: "FINANCING_CONTRACT",
              action: `Contract ${r.status} — ${r.product.name}`,
              outcome: r.status,
              actor: r.user
                ? {
                    id: r.user.userId,
                    name: r.user.name ?? undefined,
                    email: r.user.email,
                    role: r.user.role,
                  }
                : null,
              details: null,
              occurredAt: r.updatedAt,
              refId: r.contractId,
            })),
          ),
      );
    }

    if (!type || type === "login") {
      sources.push(
        prisma.userSession
          .findMany({
            where: { user: { companyId }, createdAt: dateFilter },
            include: {
              user: {
                select: { userId: true, name: true, email: true, role: true },
              },
            },
            orderBy: { createdAt: "desc" },
            take: fanInTake,
          })
          .then((rows) =>
            rows.map((r) => ({
              type: "LOGIN",
              action: "User logged in",
              outcome: r.revoked ? "REVOKED" : "ACTIVE",
              actor: {
                id: r.user.userId,
                name: r.user.name ?? undefined,
                email: r.user.email,
                role: r.user.role,
              },
              details: null,
              occurredAt: r.createdAt,
              refId: r.sessionId,
            })),
          ),
      );
    }

    const results = await Promise.all(sources);
    const merged = results
      .flat()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const start = (page - 1) * limit;
    const paged = merged.slice(start, start + limit);

    return {
      pagination: {
        page,
        limit,
        returned: paged.length,
        hasMore: merged.length > start + limit,
      },
      activities: paged,
    };
  }
}

export { ActivityType };
