import { prisma, Role, InstallmentStatus } from "@/infrastructure/prisma";
import { UnauthorizedError, NotFoundError } from "@/shared/utils/AppError";
import { Decimal } from "@prisma/client/runtime/client";

export class CustomerManagementService {
  /**
   * Scopes and checks if the reviewer is authorized to view the target customer.
   */
  private static async validateCustomerScoping(
    customerId: string,
    reviewerId: string,
    reviewerRole: Role,
  ): Promise<any> {
    const customer = await prisma.user.findUnique({
      where: { userId: customerId },
      include: {
        referredByMarketer: true,
      },
    });

    if (!customer) {
      throw new NotFoundError("Customer not found.");
    }

    if (reviewerRole === Role.MARKETER) {
      if (customer.referredByMarketerId !== reviewerId) {
        throw new UnauthorizedError(
          "Unauthorized: This customer is not within your referral scope.",
        );
      }
    } else if (reviewerRole === Role.ADMIN) {
      if (customer.referredByMarketer?.createdById !== reviewerId) {
        throw new UnauthorizedError(
          "Unauthorized: This customer's marketer is not assigned to you.",
        );
      }
    } else if (
      reviewerRole === Role.SUPER_ADMIN ||
      reviewerRole === Role.COMPANY
    ) {
      // Allowed global corporate view
    } else {
      // Customer viewing themselves
      if (customerId !== reviewerId) {
        throw new UnauthorizedError("Unauthorized access.");
      }
    }

    return customer;
  }

  /**
   * Retrieves customers within the reviewer's authorized scoping boundaries.
   */
  static async listCustomers(
    reviewerId: string,
    reviewerRole: Role,
    query: { page: number; limit: number; search?: string },
  ) {
    const skip = (query.page - 1) * query.limit;

    let whereClause: any = {
      role: Role.CUSTOMER,
    };

    if (query.search) {
      whereClause.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (reviewerRole === Role.MARKETER) {
      whereClause.referredByMarketerId = reviewerId;
    } else if (reviewerRole === Role.ADMIN) {
      whereClause.referredByMarketer = {
        createdById: reviewerId,
      };
    } else if (
      reviewerRole === Role.COMPANY ||
      reviewerRole === Role.SUPER_ADMIN
    ) {
      // Global list
    } else {
      throw new UnauthorizedError("Unauthorized role.");
    }

    const [total, customers] = await Promise.all([
      prisma.user.count({ where: whereClause }),
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        select: {
          userId: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          referredByMarketer: {
            select: {
              userId: true,
              name: true,
              email: true,
              referralCode: true,
            },
          },
        },
      }),
    ]);

    return {
      metadata: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
      customers,
    };
  }

  /**
   * Fetches the ongoing financed products for a specific customer.
   */
  static async getCustomerProducts(
    customerId: string,
    reviewerId: string,
    reviewerRole: Role,
  ) {
    await this.validateCustomerScoping(customerId, reviewerId, reviewerRole);

    // Fetch unique products having installments assigned to this customer
    const financedProducts = await prisma.installment.findMany({
      where: { userId: customerId },
      distinct: ["productId"],
      include: {
        product: {
          select: {
            productId: true,
            name: true,
            slug: true,
            price: true,
            images: {
              select: {
                imageUrl: true,
              },
            },
          },
        },
      },
    });

    // For each financed product, let's pre-compute the completion percentage
    const results = await Promise.all(
      financedProducts.map(async (f) => {
        const stats = await this.calculateProgressPercentage(
          customerId,
          f.productId,
        );
        return {
          product: f.product,
          percentagePaid: stats.percentagePaid,
          totalFinanced: stats.totalFinanced,
          totalPaid: stats.totalPaid,
        };
      }),
    );

    return results;
  }

  /**
   * Returns chronological installment due dates, payment history, and payment progress percentage.
   */
  static async getInstallmentSchedule(
    customerId: string,
    productId: string,
    reviewerId: string,
    reviewerRole: Role,
  ) {
    await this.validateCustomerScoping(customerId, reviewerId, reviewerRole);

    const installments = await prisma.installment.findMany({
      where: {
        userId: customerId,
        productId,
      },
      orderBy: { dueDate: "asc" },
      include: {
        payments: {
          select: {
            paymentId: true,
            amount: true,
            status: true,
            gatewayRef: true,
            createdAt: true,
          },
        },
      },
    });

    const progress = await this.calculateProgressPercentage(
      customerId,
      productId,
    );

    return {
      percentagePaid: progress.percentagePaid,
      totalFinanced: progress.totalFinanced,
      totalPaid: progress.totalPaid,
      schedule: installments.map((inst) => ({
        installmentId: inst.installmentId,
        amount: inst.amount,
        dueDate: inst.dueDate,
        status: inst.status,
        payments: inst.payments,
      })),
    };
  }

  /**
   * Computes the payment progress percentage for a financed product.
   */
  private static async calculateProgressPercentage(
    customerId: string,
    productId: string,
  ) {
    const installments = await prisma.installment.findMany({
      where: {
        userId: customerId,
        productId,
      },
      select: {
        amount: true,
        status: true,
      },
    });

    let totalFinanced = new Decimal(0);
    let totalPaid = new Decimal(0);

    for (const inst of installments) {
      totalFinanced = totalFinanced.plus(inst.amount);
      if (inst.status === InstallmentStatus.PAID) {
        totalPaid = totalPaid.plus(inst.amount);
      }
    }

    const percentagePaid = totalFinanced.isZero()
      ? 0
      : Number(totalPaid.div(totalFinanced).times(100).toFixed(2));

    return {
      percentagePaid,
      totalFinanced,
      totalPaid,
    };
  }

  /**
   * Fetches complete ledger logs and payment history across all financing contracts for a customer.
   */
  static async getCustomerPaymentHistory(
    customerId: string,
    reviewerId: string,
    reviewerRole: Role,
  ) {
    await this.validateCustomerScoping(customerId, reviewerId, reviewerRole);

    const payments = await prisma.payment.findMany({
      where: {
        installment: {
          userId: customerId,
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        installment: {
          select: {
            installmentId: true,
            dueDate: true,
            product: {
              select: {
                productId: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    return payments.map((p) => ({
      paymentId: p.paymentId,
      amount: p.amount,
      status: p.status,
      gatewayRef: p.gatewayRef,
      createdAt: p.createdAt,
      product: p.installment.product,
      installment: {
        installmentId: p.installment.installmentId,
        dueDate: p.installment.dueDate,
      },
    }));
  }

  /**
   * Returns a complete corporate org hierarchy view:
   * Company -> Admins -> Marketers -> Referred Customers.
   */
  static async getCorporateHierarchy(reviewerId: string, reviewerRole: Role) {
    if (reviewerRole !== Role.COMPANY && reviewerRole !== Role.SUPER_ADMIN) {
      throw new UnauthorizedError(
        "Corporate hierarchy view is restricted to Company accounts.",
      );
    }

    const admins = await prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: {
        userId: true,
        name: true,
        email: true,
        createdUsers: {
          where: { role: Role.MARKETER },
          select: {
            userId: true,
            name: true,
            email: true,
            referralCode: true,
            referredUsers: {
              where: { role: Role.CUSTOMER },
              select: {
                userId: true,
                name: true,
                email: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    return admins;
  }
}
