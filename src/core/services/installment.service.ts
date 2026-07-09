import {
  prisma,
  InstallmentStatus,
  PaymentStatus,
  Prisma,
  FinancingStatus,
  PaymentIntentType,
  PaymentInitStatus,
} from "@/infrastructure/prisma";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/shared/utils/AppError";
import { PaymentIntentService } from "@/core/services/payment-intent.service";
import { randomUUID } from "crypto";

interface GenerateInstallmentScheduleParams {
  financingContractId: string;
  totalAmount: number;
  months: number;
  firstPaymentDate: Date;
}

export class InstallmentService {
  static generateInstallmentSchedule({
    financingContractId,
    totalAmount,
    months,
    firstPaymentDate,
  }: GenerateInstallmentScheduleParams) {
    if (months <= 0) {
      throw new Error("Months must be greater than 0");
    }
    const totalInCents = Math.round(totalAmount * 100);
    const baseAmountInCents = Math.floor(totalInCents / months);
    const remainder = totalInCents % months;
    const anchorDate = new Date(firstPaymentDate);

    const schedules: Prisma.InstallmentCreateManyInput[] = [];

    for (let i = 0; i < months; i++) {
      const dueDate = new Date(anchorDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      const installmentAmountInCents =
        i === months - 1 ? baseAmountInCents + remainder : baseAmountInCents;

      schedules.push({
        financingContractId,
        amount: new Prisma.Decimal(installmentAmountInCents / 100),
        dueDate,
        sequence: i + 1,
        status: InstallmentStatus.PENDING,
      });
    }

    return schedules;
  }

  static async getRelatedCustomersInstallments(
    userId: string,
    params: {
      page?: number;
      limit?: number;
    },
  ) {
    const { page = 1, limit = 10 } = params;
    const skip = (page - 1) * limit;
    const whereClause = {
      financingContract: {
        userId,
      },
    };

    const [installments, total] = await prisma.$transaction([
      prisma.installment.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          dueDate: "asc",
        },
        include: {
          financingContract: {
            select: {
              contractId: true,
              totalFinanced: true,
              status: true,
              activatedAt: true,
              completedAt: true,
              kycApplication: {
                include: {
                  product: {
                    include: {
                      images: true,
                    },
                  },
                  user: {
                    select: {
                      userId: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
          payments: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      }),
      prisma.installment.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      installments,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  static async getCustomerInstallments(financingContractId: string) {
    return prisma.installment.findMany({
      where: {
        financingContractId,
      },
      include: {
        financingContract: {
          select: {
            contractId: true,
            totalFinanced: true,
            status: true,
            kycApplication: {
              include: {
                product: true,
                user: true,
              },
            },
          },
        },

        payments: true,
      },
      orderBy: {
        dueDate: "asc",
      },
    });
  }

  static async getFinancedProducts(financingContractId: string) {
    const financedProducts = await prisma.installment.findMany({
      where: {
        financingContractId,
      },
      distinct: ["financingContractId"],
      include: {
        financingContract: {
          include: {
            kycApplication: {
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
            },
          },
        },
      },
    });

    return financedProducts;
  }

  static async calculateProgressPercentage(financingContractId: string) {
    const installments = await prisma.installment.findMany({
      where: {
        financingContractId,
      },

      include: {
        financingContract: {
          select: {
            totalFinanced: true,
          },
        },
      },
    });

    const totalFinanced = installments.reduce(
      (sum, item) => sum + Number(item.financingContract.totalFinanced),
      0,
    );

    const totalPaid = installments
      .filter((i) => i.status === InstallmentStatus.PAID)
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const percentagePaid =
      totalFinanced === 0
        ? 0
        : Number(((totalPaid / totalFinanced) * 100).toFixed(2));

    return {
      totalFinanced,
      totalPaid,
      percentagePaid,
    };
  }

  static async initializeInstallmentPayment(
    installmentId: string,
    customerId: string,
  ) {
    const installment = await prisma.installment.findUnique({
      where: {
        installmentId,
      },
      include: {
        financingContract: {
          include: {
            user: true,
            product: true,
          },
        },
      },
    });

    if (!installment) {
      throw new NotFoundError("Installment not found");
    }

    if (installment.financingContract.userId !== customerId) {
      throw new UnauthorizedError(
        "You are not authorized to pay for this installment",
      );
    }

    if (installment.status === InstallmentStatus.PAID) {
      throw new BadRequestError("This installment has already been settled");
    }

    const contractStatus = installment.financingContract.status;

    if (
      contractStatus !== FinancingStatus.ACTIVE &&
      contractStatus !== FinancingStatus.DEFAULTED
    ) {
      throw new BadRequestError(
        `Payments are not allowed for contract status: ${contractStatus}`,
      );
    }

    const customer = installment.financingContract.user;
    const product = installment.financingContract.product;
    const amount = Number(installment.amount);

    const idempotencyKey = randomUUID();

    const { intent, isExisting } = await PaymentIntentService.reserve({
      type: PaymentIntentType.INSTALLMENT,
      amount: installment.amount,
      customerId: customer.userId,
      installmentId: installment.installmentId,
      planId: product.productId,
      idempotencyKey,
    });

    if (isExisting) {
      if (intent.status === PaymentInitStatus.INITIALIZED || intent.status === PaymentInitStatus.PENDING) {
        return {
          authorizationUrl: intent.authorizationUrl!,
          reference: intent.reference!,
          isExisting: true,
          message: "You have an active pending payment. Please complete it first.",
        };
      }
      throw new BadRequestError(
        `Payment intent is in ${intent.status} state, cannot re-initialize`,
      );
    }

    const result = await PaymentIntentService.initializePaystack(
      intent.intentId,
      {
        email: customer.email,
        metadata: {
          installmentId: installment.installmentId,
          financingContractId: installment.financingContractId,
          productId: product.productId,
          sequence: installment.sequence,
        },
      },
    );

    await PaymentIntentService.markPending(intent.intentId);

    return {
      authorizationUrl: result.authorizationUrl,
      accessCode: result.accessCode,
      reference: result.reference,
      amount,
      installmentId: installment.installmentId,
      dueDate: installment.dueDate,
    };
  }
}