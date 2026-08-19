import {
  prisma,
  InstallmentStatus,
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
import {
  computeInstallmentEligibility,
  InstallmentEligibilityState,
  EligibilityMessages,
} from "@/core/services/installment-eligibility.helper";
import type {
  EligibilityInstallmentInput,
  InstallmentEligibility,
  NextUnpaidMarker,
} from "./installment-eligibility.helper";

interface GenerateInstallmentScheduleParams {
  financingContractId: string;
  totalAmount: number;
  months: number;
  firstPaymentDate: Date;
}

interface PaginationParams {
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 10;

const installmentDetailInclude = {
  financingContract: {
    select: {
      contractId: true,
      totalFinanced: true,
      status: true,
      kycApplication: {
        include: {
          product: true,
          user: {
            select: {
              userId: true,
              name: true,
              email: true,
              role: true,
              companyId: true,
            },
          },
        },
      },
    },
  },
  payments: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },
} satisfies Prisma.InstallmentInclude;

function toEligibilityResponseFields(eligibility: InstallmentEligibility) {
  return {
    canPay: eligibility.canPay,
    isNextInstallment: eligibility.isNextInstallment,
    paymentWindowStarted: eligibility.paymentWindowStarted,
    availableFrom: eligibility.availableFrom,
    daysUntilDue: eligibility.daysUntilDue,
    daysOverdue: eligibility.daysOverdue,
    isOverdue: eligibility.isOverdue,
    isDueToday: eligibility.isDueToday,
    isUpcoming: eligibility.isUpcoming,
    paymentStatusLabel: eligibility.paymentStatusLabel,
    paymentRestrictionReason: eligibility.reason,
    paymentEligibility: {
      canPay: eligibility.canPay,
      state: eligibility.state,
      reason: eligibility.reason,
      availableFrom: eligibility.availableFrom,
      isNextInstallment: eligibility.isNextInstallment,
      paymentWindowStarted: eligibility.paymentWindowStarted,
      daysUntilDue: eligibility.daysUntilDue,
      daysOverdue: eligibility.daysOverdue,
    },
  };
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
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new Error("totalAmount must be a positive finite number");
    }

    const totalInCents = Math.round(totalAmount * 100);
    const baseAmountInCents = Math.floor(totalInCents / months);
    const remainder = totalInCents % months;

    const schedules: Prisma.InstallmentCreateManyInput[] = [];

    for (let i = 0; i < months; i++) {
      const dueDate = InstallmentService.addMonthsClamped(firstPaymentDate, i);
      const installmentAmountInCents =
        i === months - 1 ? baseAmountInCents + remainder : baseAmountInCents;

      schedules.push({
        financingContractId,
        amount: new Prisma.Decimal(installmentAmountInCents).dividedBy(100),
        dueDate,
        sequence: i + 1,
        status: InstallmentStatus.PENDING,
      });
    }

    return schedules;
  }

  private static addMonthsClamped(date: Date, monthsToAdd: number): Date {
    const originalDay = date.getDate();
    const result = new Date(date);
    result.setDate(1);
    result.setMonth(result.getMonth() + monthsToAdd);

    const lastDayOfTargetMonth = new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0,
    ).getDate();

    result.setDate(Math.min(originalDay, lastDayOfTargetMonth));
    return result;
  }

  private static async assertInstallmentIsPayable(
    installment: EligibilityInstallmentInput & { financingContractId: string },
  ): Promise<InstallmentEligibility> {
    let nextUnpaid: NextUnpaidMarker | null = null;

    if (installment.status !== InstallmentStatus.PAID) {
      nextUnpaid = await prisma.installment.findFirst({
        where: {
          financingContractId: installment.financingContractId,
          status: { not: InstallmentStatus.PAID },
        },
        orderBy: { sequence: "asc" },
        select: { installmentId: true, sequence: true, dueDate: true },
      });
    }

    const eligibility = computeInstallmentEligibility(installment, nextUnpaid);

    if (eligibility.state === InstallmentEligibilityState.CONTRACT_COMPLETED) {
      throw new BadRequestError(EligibilityMessages.contractCompleted);
    }

    if (!eligibility.canPay) {
      throw new BadRequestError(
        eligibility.reason ?? "This installment is not currently payable.",
      );
    }

    return eligibility;
  }

  static async getRelatedCustomersInstallments(
    userId: string,
    params: PaginationParams,
  ) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(
      MAX_PAGE_LIMIT,
      Math.max(1, params.limit ?? DEFAULT_PAGE_LIMIT),
    );
    const sortOrder = params.sortOrder ?? "asc";
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
          dueDate: sortOrder,
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

    const contractIds = Array.from(
      new Set(installments.map((i) => i.financingContractId)),
    );

    const minUnpaidSequenceByContract = contractIds.length
      ? await prisma.installment.groupBy({
          by: ["financingContractId"],
          where: {
            financingContractId: { in: contractIds },
            status: { not: InstallmentStatus.PAID },
          },
          _min: { sequence: true },
        })
      : [];

    const markerLookupPairs = minUnpaidSequenceByContract
      .filter((row) => row._min.sequence !== null)
      .map((row) => ({
        financingContractId: row.financingContractId,
        sequence: row._min.sequence as number,
      }));

    const nextUnpaidRows = markerLookupPairs.length
      ? await prisma.installment.findMany({
          where: {
            OR: markerLookupPairs.map((pair) => ({
              financingContractId: pair.financingContractId,
              sequence: pair.sequence,
            })),
          },
          select: {
            installmentId: true,
            financingContractId: true,
            sequence: true,
            dueDate: true,
          },
        })
      : [];

    const nextUnpaidByContract = new Map<string, NextUnpaidMarker>(
      nextUnpaidRows.map((row) => [
        row.financingContractId,
        {
          installmentId: row.installmentId,
          sequence: row.sequence,
          dueDate: row.dueDate,
        },
      ]),
    );

    const enrichedInstallments = installments.map((installment) => {
      const marker =
        nextUnpaidByContract.get(installment.financingContractId) ?? null;
      const eligibility = computeInstallmentEligibility(installment, marker);

      return {
        ...installment,
        ...toEligibilityResponseFields(eligibility),
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      installments: enrichedInstallments,
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
      include: installmentDetailInclude,
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
      // `distinct` needs an explicit `orderBy` to be deterministic about
      // which row represents each distinct financingContractId — without
      // it, Prisma doesn't guarantee which installment row "wins".
      orderBy: {
        sequence: "asc",
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
    // Aggregate the PAID sum in the database instead of pulling every
    // installment row into memory just to filter+reduce in JS.
    const [contract, paidAgg] = await prisma.$transaction([
      prisma.financingContract.findUnique({
        where: { contractId: financingContractId },
        select: { totalFinanced: true },
      }),
      prisma.installment.aggregate({
        where: {
          financingContractId,
          status: InstallmentStatus.PAID,
        },
        _sum: { amount: true },
      }),
    ]);

    if (!contract) {
      throw new NotFoundError("Financing contract not found");
    }

    const totalFinanced = Number(contract.totalFinanced);
    const totalPaid = Number(paidAgg._sum.amount ?? 0);

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

  static async getInstallmentById(installmentId: string) {
    const installment = await prisma.installment.findUnique({
      where: { installmentId },
      include: installmentDetailInclude,
    });

    if (!installment) {
      return null;
    }

    let nextUnpaid: NextUnpaidMarker | null = null;
    if (installment.status !== InstallmentStatus.PAID) {
      nextUnpaid = await prisma.installment.findFirst({
        where: {
          financingContractId: installment.financingContractId,
          status: { not: InstallmentStatus.PAID },
        },
        orderBy: { sequence: "asc" },
        select: { installmentId: true, sequence: true, dueDate: true },
      });
    }

    const eligibility = computeInstallmentEligibility(installment, nextUnpaid);

    return {
      ...installment,
      ...toEligibilityResponseFields(eligibility),
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
            kycApplication: {
              include: {
                user: true,
                product: true,
              },
            },
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

    await InstallmentService.assertInstallmentIsPayable(installment);

    const customer = installment.financingContract.kycApplication?.user;
    const product = installment.financingContract.kycApplication?.product;

    if (!customer?.email) {
      throw new BadRequestError(
        "No customer with a valid email is linked to this contract",
      );
    }

    if (!product) {
      throw new BadRequestError("No product is linked to this contract");
    }

    const amount = Number(installment.amount);
    const idempotencyKey = randomUUID();

    const { intent, isExisting } = await PaymentIntentService.reserve({
      type: PaymentIntentType.INSTALLMENT,
      amount: installment.amount,
      customerId: customer.userId,
      installmentId: installment.installmentId,
      planId: product.productId,
      idempotencyKey,
      initializationPayload: {
        email: customer.email,
        callbackUrl: `${process.env.FRONTEND_URL}/customer/installments`,
        metadata: {
          installmentId: installment.installmentId,
          financingContractId: installment.financingContractId,
          productId: product.productId,
          sequence: installment.sequence,
        },
      },
    });

    if (isExisting) {
      if (
        intent.status === PaymentInitStatus.INITIALIZED ||
        intent.status === PaymentInitStatus.PENDING
      ) {
        return {
          authorization_url: intent.authorizationUrl ?? "",
          access_code: "",
          reference: intent.reference ?? "",
          isExisting: true,
          message:
            "You have an active pending payment. Please complete it first.",
        };
      }
      throw new BadRequestError(
        `Payment intent is in ${intent.status} state, cannot re-initialize`,
      );
    }

    const result = await PaymentIntentService.initializePaystack(
      intent.intentId,
      {
        traceId: randomUUID(),
        paymentIntentId: intent.intentId,
      },
    );

    await PaymentIntentService.markPending(intent.intentId);

    return {
      authorization_url: result.authorization_url,
      access_code: result.access_code,
      reference: result.reference,
      amount,
      installmentId: installment.installmentId,
      dueDate: installment.dueDate,
    };
  }
}

// import {
//   prisma,
//   InstallmentStatus,
//   PaymentStatus,
//   Prisma,
//   FinancingStatus,
//   PaymentIntentType,
//   PaymentInitStatus,
// } from "@/infrastructure/prisma";
// import {
//   BadRequestError,
//   NotFoundError,
//   UnauthorizedError,
// } from "@/shared/utils/AppError";
// import { PaymentIntentService } from "@/core/services/payment-intent.service";
// import { randomUUID } from "crypto";

// interface GenerateInstallmentScheduleParams {
//   financingContractId: string;
//   totalAmount: number;
//   months: number;
//   firstPaymentDate: Date;
// }

// export class InstallmentService {
//   static generateInstallmentSchedule({
//     financingContractId,
//     totalAmount,
//     months,
//     firstPaymentDate,
//   }: GenerateInstallmentScheduleParams) {
//     if (months <= 0) {
//       throw new Error("Months must be greater than 0");
//     }
//     const totalInCents = Math.round(totalAmount * 100);
//     const baseAmountInCents = Math.floor(totalInCents / months);
//     const remainder = totalInCents % months;
//     const anchorDate = new Date(firstPaymentDate);

//     const schedules: Prisma.InstallmentCreateManyInput[] = [];

//     for (let i = 0; i < months; i++) {
//       const dueDate = new Date(anchorDate);
//       dueDate.setMonth(dueDate.getMonth() + i);
//       const installmentAmountInCents =
//         i === months - 1 ? baseAmountInCents + remainder : baseAmountInCents;

//       schedules.push({
//         financingContractId,
//         amount: new Prisma.Decimal(installmentAmountInCents / 100),
//         dueDate,
//         sequence: i + 1,
//         status: InstallmentStatus.PENDING,
//       });
//     }

//     return schedules;
//   }

//   static async getRelatedCustomersInstallments(
//     userId: string,
//     params: {
//       page?: number;
//       limit?: number;
//       sortOrder?: "asc" | "desc";
//     },
//   ) {
//     const { page = 1, limit = 10, sortOrder = "asc" } = params;
//     const skip = (page - 1) * limit;
//     const whereClause = {
//       financingContract: {
//         userId,
//       },
//     };

//     const [installments, total] = await prisma.$transaction([
//       prisma.installment.findMany({
//         where: whereClause,
//         skip,
//         take: limit,
//         orderBy: {
//           dueDate: sortOrder,
//         },
//         include: {
//           financingContract: {
//             select: {
//               contractId: true,
//               totalFinanced: true,
//               status: true,
//               activatedAt: true,
//               completedAt: true,
//               kycApplication: {
//                 include: {
//                   product: {
//                     include: {
//                       images: true,
//                     },
//                   },
//                   user: {
//                     select: {
//                       userId: true,
//                       name: true,
//                       email: true,
//                     },
//                   },
//                 },
//               },
//             },
//           },
//           payments: {
//             orderBy: {
//               createdAt: "desc",
//             },
//           },
//         },
//       }),
//       prisma.installment.count({
//         where: whereClause,
//       }),
//     ]);

//     const totalPages = Math.ceil(total / limit);

//     return {
//       installments,
//       pagination: {
//         total,
//         totalPages,
//         currentPage: page,
//         limit,
//         hasNextPage: page < totalPages,
//         hasPreviousPage: page > 1,
//       },
//     };
//   }

//   static async getCustomerInstallments(financingContractId: string) {
//     return prisma.installment.findMany({
//       where: {
//         financingContractId,
//       },
//       include: {
//         financingContract: {
//           select: {
//             contractId: true,
//             totalFinanced: true,
//             status: true,
//             kycApplication: {
//               include: {
//                 product: true,
//                 user: true,
//               },
//             },
//           },
//         },

//         payments: true,
//       },
//       orderBy: {
//         dueDate: "asc",
//       },
//     });
//   }

//   static async getFinancedProducts(financingContractId: string) {
//     const financedProducts = await prisma.installment.findMany({
//       where: {
//         financingContractId,
//       },
//       distinct: ["financingContractId"],
//       include: {
//         financingContract: {
//           include: {
//             kycApplication: {
//               include: {
//                 product: {
//                   select: {
//                     productId: true,
//                     name: true,
//                     slug: true,
//                     price: true,

//                     images: {
//                       select: {
//                         imageUrl: true,
//                       },
//                     },
//                   },
//                 },
//               },
//             },
//           },
//         },
//       },
//     });

//     return financedProducts;
//   }

//   static async calculateProgressPercentage(financingContractId: string) {
//     const [contract, installments] = await prisma.$transaction([
//       prisma.financingContract.findUnique({
//         where: { contractId: financingContractId },
//         select: { totalFinanced: true },
//       }),
//       prisma.installment.findMany({
//         where: { financingContractId },
//       }),
//     ]);

//     if (!contract) {
//       throw new NotFoundError("Financing contract not found");
//     }

//     const totalFinanced = Number(contract.totalFinanced);

//     const totalPaid = installments
//       .filter((i) => i.status === InstallmentStatus.PAID)
//       .reduce((sum, item) => sum + Number(item.amount), 0);

//     const percentagePaid =
//       totalFinanced === 0
//         ? 0
//         : Number(((totalPaid / totalFinanced) * 100).toFixed(2));

//     return {
//       totalFinanced,
//       totalPaid,
//       percentagePaid,
//     };
//   }

//   static async getInstallmentById(installmentId: string) {
//     return prisma.installment.findUnique({
//       where: { installmentId },
//       include: {
//         financingContract: {
//           select: {
//             contractId: true,
//             totalFinanced: true,
//             status: true,
//             kycApplication: {
//               include: {
//                 product: true,
//                 user: true,
//               },
//             },
//           },
//         },
//         payments: {
//           orderBy: {
//             createdAt: "desc",
//           },
//         },
//       },
//     });
//   }

//   static async initializeInstallmentPayment(
//     installmentId: string,
//     customerId: string,
//   ) {
//     const installment = await prisma.installment.findUnique({
//       where: {
//         installmentId,
//       },
//       include: {
//         financingContract: {
//           include: {
//             user: true,
//             product: true,
//           },
//         },
//       },
//     });

//     if (!installment) {
//       throw new NotFoundError("Installment not found");
//     }

//     if (installment.financingContract.userId !== customerId) {
//       throw new UnauthorizedError(
//         "You are not authorized to pay for this installment",
//       );
//     }

//     if (installment.status === InstallmentStatus.PAID) {
//       throw new BadRequestError("This installment has already been settled");
//     }

//     const contractStatus = installment.financingContract.status;

//     if (
//       contractStatus !== FinancingStatus.ACTIVE &&
//       contractStatus !== FinancingStatus.DEFAULTED
//     ) {
//       throw new BadRequestError(
//         `Payments are not allowed for contract status: ${contractStatus}`,
//       );
//     }

//     const customer = installment.financingContract.user;
//     const product = installment.financingContract.product;
//     const amount = Number(installment.amount);

//     const idempotencyKey = randomUUID();

//     const { intent, isExisting } = await PaymentIntentService.reserve({
//       type: PaymentIntentType.INSTALLMENT,
//       amount: installment.amount,
//       customerId: customer?.userId,
//       installmentId: installment.installmentId,
//       planId: product.productId,
//       idempotencyKey,
//     });

//     if (isExisting) {
//       if (
//         intent.status === PaymentInitStatus.INITIALIZED ||
//         intent.status === PaymentInitStatus.PENDING
//       ) {
//         return {
//           authorization_url: intent.authorizationUrl ?? "",
//           access_code: "",
//           reference: intent.reference ?? "",
//           isExisting: true,
//           message:
//             "You have an active pending payment. Please complete it first.",
//         };
//       }
//       throw new BadRequestError(
//         `Payment intent is in ${intent.status} state, cannot re-initialize`,
//       );
//     }

//     const result = await PaymentIntentService.initializePaystack(
//       intent.intentId,
//       {
//         email: customer?.email ?? "",
//         metadata: {
//           installmentId: installment.installmentId,
//           financingContractId: installment.financingContractId,
//           productId: product.productId,
//           sequence: installment.sequence,
//         },
//         callbackUrl: `${process.env.FRONTEND_URL}/customer/installments`,
//       },
//       {
//         traceId: randomUUID(),
//         paymentIntentId: intent.intentId,
//       },
//     );

//     await PaymentIntentService.markPending(intent.intentId);

//     return {
//       authorization_url: result.authorization_url,
//       access_code: result.access_code,
//       reference: result.reference,
//       amount,
//       installmentId: installment.installmentId,
//       dueDate: installment.dueDate,
//     };
//   }
// }
