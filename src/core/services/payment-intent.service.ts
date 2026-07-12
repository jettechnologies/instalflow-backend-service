import { prisma, Prisma } from "@/infrastructure/prisma";
import { PaymentInitStatus, PaymentIntentType } from "@/infrastructure/prisma";
import {
  PaystackHttpClient,
  PaystackErrorCode,
  RequestContext,
} from "@/infrastructure/paystack";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@/shared/utils/AppError";
import { randomUUID } from "crypto";

const INTENT_EXPIRATION_MS = 10 * 60 * 1000;

interface ReserveIntentParams {
  type: PaymentIntentType;
  amount: number | Prisma.Decimal;
  customerId?: string;
  companyId?: string;
  installmentId?: string;
  onboardingId?: string;
  subscriptionId?: string;
  planId?: string;
  idempotencyKey?: string;
  clientIdempotencyKey?: string;
}

interface InitializeIntentParams {
  email: string;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
  intentId?: string;
}

export class PaymentIntentService {
  static ACTIVE_STATUSES: PaymentInitStatus[] = [
    PaymentInitStatus.INITIALIZING,
    PaymentInitStatus.INITIALIZED,
    PaymentInitStatus.PENDING,
    PaymentInitStatus.PROCESSING,
  ];

  static TERMINAL_STATUSES: PaymentInitStatus[] = [
    PaymentInitStatus.SUCCESS,
    PaymentInitStatus.FAILED,
    PaymentInitStatus.EXPIRED,
    PaymentInitStatus.CANCELLED,
  ];

  static async reserve(params: ReserveIntentParams): Promise<{
    intent: Prisma.PaymentIntentGetPayload<{}>;
    isExisting: boolean;
    message?: string;
  }> {
    return this.reserveInternal(params, true);
  }

  private static async reserveInternal(
    params: ReserveIntentParams,
    allowRetry: boolean,
  ): Promise<{
    intent: Prisma.PaymentIntentGetPayload<{}>;
    isExisting: boolean;
    message?: string;
  }> {
    const reservationKey = this.buildReservationKey(params);

    // Client idempotency layer
    if (params.clientIdempotencyKey) {
      const existing = await this.findByIdempotencyKey(
        params.clientIdempotencyKey,
      );

      if (existing) {
        return {
          intent: existing,
          isExisting: true,
          message: this.getStatusMessage(existing.status),
        };
      }
    }

    const idempotencyKey = params.clientIdempotencyKey ?? randomUUID();

    try {
      const intent = await prisma.paymentIntent.create({
        data: {
          type: params.type,
          amount: new Prisma.Decimal(params.amount),
          currency: "NGN",
          customerId: params.customerId,
          companyId: params.companyId,
          installmentId: params.installmentId,
          onboardingId: params.onboardingId,
          subscriptionId: params.subscriptionId,
          planId: params.planId,
          reservationKey,
          status: PaymentInitStatus.INITIALIZING,
          idempotencyKey,
          expiresAt: new Date(Date.now() + INTENT_EXPIRATION_MS),
        },
      });

      return {
        intent,
        isExisting: false,
      };
    } catch (err) {
      if (!this.isUniqueReservationViolation(err)) {
        throw err;
      }

      const existing = await prisma.paymentIntent.findFirst({
        where: {
          reservationKey,
          status: {
            in: this.ACTIVE_STATUSES,
          },
        },
      });

      if (existing) {
        return {
          intent: existing,
          isExisting: true,
          message: this.getStatusMessage(existing.status),
        };
      }

      if (!allowRetry) {
        throw new ConflictError(
          "Unable to reserve payment intent because the reservation changed during processing.",
        );
      }

      return this.reserveInternal(params, false);
    }
  }

  private static buildReservationKey(params: ReserveIntentParams): string {
    switch (params.type) {
      case PaymentIntentType.INSTALLMENT:
        return `INSTALLMENT:${params.installmentId}`;
      case PaymentIntentType.SUBSCRIPTION:
        return `SUBSCRIPTION:${params.companyId}`;
      case PaymentIntentType.ONBOARDING:
        return `ONBOARDING:${params.onboardingId}`;
    }
  }

  private static isUniqueReservationViolation(err: unknown): boolean {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const target = (err.meta?.target as string[] | string | undefined) ?? [];
      const fields = Array.isArray(target) ? target : [target];
      return (
        fields.includes("reservation_key") || fields.includes("reservationKey")
      );
    }
    return false;
  }

  /**
   * Shared guarded-transition primitive used by every `mark*` method (and by
   * `cancel`). Performs a single conditional UPDATE — `WHERE status NOT IN
   * (terminal states)` — and inspects the affected row count instead of doing
   * a read-then-write, so a concurrent worker can never flip a row that has
   * already reached a terminal state (SUCCESS/FAILED/EXPIRED/CANCELLED).
   *
   * Per architecture rule: "No code path may UPDATE a PaymentIntent already
   * in a terminal state."
   */
  private static async transitionStatus(
    intentId: string,
    toStatus: PaymentInitStatus,
    extraData: Prisma.PaymentIntentUpdateManyMutationInput = {},
  ) {
    const result = await prisma.paymentIntent.updateMany({
      where: {
        intentId,
        status: { notIn: this.TERMINAL_STATUSES },
      },
      data: {
        status: toStatus,
        ...extraData,
      },
    });

    if (result.count === 0) {
      const current = await prisma.paymentIntent.findUnique({
        where: { intentId },
      });

      if (!current) {
        throw new NotFoundError("Payment intent not found");
      }

      throw new ConflictError(
        `Cannot transition intent ${intentId} to ${toStatus}: already in terminal state ${current.status}`,
      );
    }

    // updateMany doesn't return the row; re-fetch the row we just guaranteed
    // we (and only we) just wrote.
    return prisma.paymentIntent.findUniqueOrThrow({ where: { intentId } });
  }

  static async cancel(intentionId: string, reason?: string) {
    try {
      await this.transitionStatus(intentionId, PaymentInitStatus.CANCELLED, {
        authorizationUrl: reason ?? undefined,
      });
      return { cancelled: true };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { cancelled: false, reason: "Intent not found" };
      }
      if (err instanceof ConflictError) {
        return { cancelled: false, reason: "Intent already terminal" };
      }
      throw err;
    }
  }

  static async markInitialized(
    intentId: string,
    providerData: { reference: string; authorizationUrl: string },
  ) {
    return this.transitionStatus(intentId, PaymentInitStatus.INITIALIZED, {
      reference: providerData.reference,
      authorizationUrl: providerData.authorizationUrl,
    });
  }

  static async markPending(intentId: string) {
    return this.transitionStatus(intentId, PaymentInitStatus.PENDING);
  }

  /**
   * New in PR-2: "webhook received and resolved against DB, verification in
   * flight." Sits between PENDING and SUCCESS/FAILED in the state machine.
   */
  static async markProcessing(intentId: string) {
    return this.transitionStatus(intentId, PaymentInitStatus.PROCESSING);
  }

  static async markSuccess(intentId: string) {
    return this.transitionStatus(intentId, PaymentInitStatus.SUCCESS);
  }

  static async markFailed(intentId: string) {
    return this.transitionStatus(intentId, PaymentInitStatus.FAILED);
  }

  static async expireStale() {
    const now = new Date();

    const expiredIntents = await prisma.paymentIntent.findMany({
      where: {
        status: {
          in: [PaymentInitStatus.INITIALIZING, PaymentInitStatus.INITIALIZED],
        },
        expiresAt: { lt: now },
      },
    });

    const result = await prisma.paymentIntent.updateMany({
      where: {
        status: {
          in: [PaymentInitStatus.INITIALIZING, PaymentInitStatus.INITIALIZED],
        },
        expiresAt: { lt: now },
      },
      data: { status: PaymentInitStatus.EXPIRED },
    });

    return { expiredCount: result.count, expiredIntents };
  }

  static async findByReference(reference: string) {
    return prisma.paymentIntent.findUnique({
      where: { reference },
    });
  }

  static async markExpired(intentId: string) {
    return this.transitionStatus(intentId, PaymentInitStatus.EXPIRED);
  }

  static async findByIdempotencyKey(idempotencyKey: string) {
    return prisma.paymentIntent.findUnique({
      where: { idempotencyKey },
    });
  }

  static async findByInstallment(
    installmentId: string,
    statuses: PaymentInitStatus[] = [
      PaymentInitStatus.INITIALIZING,
      PaymentInitStatus.INITIALIZED,
      PaymentInitStatus.PENDING,
    ],
  ) {
    return prisma.paymentIntent.findFirst({
      where: { installmentId, status: { in: statuses } },
    });
  }

  static async findByCompany(
    companyId: string,
    statuses: PaymentInitStatus[] = [
      PaymentInitStatus.INITIALIZING,
      PaymentInitStatus.INITIALIZED,
      PaymentInitStatus.PENDING,
    ],
  ) {
    return prisma.paymentIntent.findFirst({
      where: {
        companyId,
        type: PaymentIntentType.SUBSCRIPTION,
        status: { in: statuses },
      },
    });
  }

  static async findByOnboarding(
    onboardingId: string,
    statuses: PaymentInitStatus[] = [
      PaymentInitStatus.INITIALIZING,
      PaymentInitStatus.INITIALIZED,
      PaymentInitStatus.PENDING,
    ],
  ) {
    return prisma.paymentIntent.findFirst({
      where: {
        onboardingId,
        type: PaymentIntentType.ONBOARDING,
        status: { in: statuses },
      },
    });
  }

  /**
   * Read-only helper retained per §5/PR-2: may still be used elsewhere in the
   * codebase, but `reserve()` must never call this before inserting.
   */
  static async findActiveIntent(params: ReserveIntentParams) {
    const activeStatuses = [
      PaymentInitStatus.INITIALIZING,
      PaymentInitStatus.INITIALIZED,
      PaymentInitStatus.PENDING,
    ];

    switch (params.type) {
      case PaymentIntentType.INSTALLMENT:
        if (params.installmentId) {
          return this.findByInstallment(params.installmentId, activeStatuses);
        }
        break;
      case PaymentIntentType.SUBSCRIPTION:
        if (params.companyId) {
          return this.findByCompany(params.companyId, activeStatuses);
        }
        break;
      case PaymentIntentType.ONBOARDING:
        if (params.onboardingId) {
          return this.findByOnboarding(params.onboardingId, activeStatuses);
        }
        break;
    }

    if (params.idempotencyKey) {
      return this.findByIdempotencyKey(params.idempotencyKey);
    }
  }

  private static getStatusMessage(status: PaymentInitStatus): string {
    switch (status) {
      case PaymentInitStatus.INITIALIZING:
        return "Payment initialization in progress";
      case PaymentInitStatus.INITIALIZED:
        return "Payment already initialized, complete the payment";
      case PaymentInitStatus.PENDING:
        return "Payment is being processed";
      case PaymentInitStatus.PROCESSING:
        return "Payment is being verified";
      default:
        return "Payment intent exists";
    }
  }

  static async initializePaystack(
    intentId: string,
    params: InitializeIntentParams,
    context?: RequestContext,
  ) {
    const intent = await prisma.paymentIntent.findUnique({
      where: { intentId },
    });

    if (!intent) {
      throw new NotFoundError("Payment intent not found");
    }

    try {
      const providerResponse = await PaystackHttpClient.initializeTransaction({
        email: params.email,
        amountKobo: Number(intent.amount) * 100,
        metadata: {
          ...params.metadata,
          paymentIntentId: intent.intentId,
          type: this.mapMetadataType(intent.type),
        },
        callbackUrl: params.callbackUrl,
        context,
      });

      await this.markInitialized(intentId, {
        reference: providerResponse.reference,
        authorizationUrl: providerResponse.authorization_url,
      });

      return {
        authorization_url: providerResponse.authorization_url,
        reference: providerResponse.reference,
        access_code: providerResponse.access_code,
      };
    } catch (error: any) {
      await this.markFailed(intentId);
      if (error.code === PaystackErrorCode.TIMEOUT) {
        throw new BadRequestError("Payment provider timeout, please retry");
      }
      throw error;
    }
  }

  static async verifyPaystack(reference: string, context?: RequestContext) {
    const verification = await PaystackHttpClient.verifyTransaction(
      reference,
      context,
    );

    return verification;
  }

  private static mapMetadataType(type: PaymentIntentType): string {
    switch (type) {
      case PaymentIntentType.INSTALLMENT:
        return "installment_payment";
      case PaymentIntentType.ONBOARDING:
        return "onboarding_payment";
      case PaymentIntentType.SUBSCRIPTION:
        return "company_subscription";
    }
  }
}

// import { prisma, Prisma } from "@/infrastructure/prisma";
// import { PaymentInitStatus, PaymentIntentType } from "@/infrastructure/prisma";
// import {
//   PaystackHttpClient,
//   PaystackErrorCode,
//   RequestContext,
// } from "@/infrastructure/paystack";
// import {
//   BadRequestError,
//   ConflictError,
//   NotFoundError,
// } from "@/shared/utils/AppError";
// import { randomUUID } from "crypto";

// const INTENT_EXPIRATION_MS = 10 * 60 * 1000;

// interface ReserveIntentParams {
//   type: PaymentIntentType;
//   amount: number | Prisma.Decimal;
//   customerId?: string;
//   companyId?: string;
//   installmentId?: string;
//   onboardingId?: string;
//   subscriptionId?: string;
//   planId?: string;
//   idempotencyKey?: string;
//   clientIdempotencyKey?: string;
// }

// interface InitializeIntentParams {
//   email: string;
//   metadata?: Record<string, unknown>;
//   callbackUrl?: string;
//   intentId?: string;
// }

// export class PaymentIntentService {
//   static ACTIVE_STATUSES: PaymentInitStatus[] = [
//     PaymentInitStatus.INITIALIZING,
//     PaymentInitStatus.INITIALIZED,
//     PaymentInitStatus.PENDING,
//     PaymentInitStatus.PROCESSING,
//   ];

//   static TERMINAL_STATUSES: PaymentInitStatus[] = [
//     PaymentInitStatus.SUCCESS,
//     PaymentInitStatus.FAILED,
//     PaymentInitStatus.EXPIRED,
//     PaymentInitStatus.CANCELLED,
//   ];

//   static async reserve(params: ReserveIntentParams) {
//     const reservationKey = this.buildReservationKey(params);
//     const idempotencyKey = params.clientIdempotencyKey ?? randomUUID();

//     // Client (double-submit) layer: short-circuit before the reservation insert
//     // when a caller-supplied idempotency key was already persisted.
//     if (params.clientIdempotencyKey) {
//       const existing = await this.findByIdempotencyKey(idempotencyKey);
//       if (existing) {
//         return {
//           intent: existing,
//           isExisting: true,
//           message: this.getStatusMessage(existing.status),
//         };
//       }
//     }

//     try {
//       const intent = await prisma.paymentIntent.create({
//         data: {
//           type: params.type,
//           amount: new Prisma.Decimal(params.amount),
//           currency: "NGN",
//           customerId: params.customerId,
//           companyId: params.companyId,
//           installmentId: params.installmentId,
//           onboardingId: params.onboardingId,
//           subscriptionId: params.subscriptionId,
//           planId: params.planId,
//           reservationKey,
//           status: PaymentInitStatus.INITIALIZING,
//           idempotencyKey,
//           expiresAt: new Date(Date.now() + INTENT_EXPIRATION_MS),
//         },
//       });

//       return { intent, isExisting: false };
//     } catch (err) {
//       if (this.isUniqueReservationViolation(err)) {
//         // The partial unique index rejected the insert because an active
//         // intent already exists for this reservation key. Return the winner.
//         const existing = await prisma.paymentIntent.findFirst({
//           where: { reservationKey, status: { in: this.ACTIVE_STATUSES } },
//         });
//         if (existing) {
//           return {
//             intent: existing,
//             isExisting: true,
//             message: this.getStatusMessage(existing.status),
//           };
//         }
//         // The conflicting row transitioned to a terminal state between our
//         // insert attempt and this read — retry once with a fresh idempotency key.
//         return this.reserve({ ...params, clientIdempotencyKey: undefined });
//       }
//       throw err;
//     }
//   }

//   private static buildReservationKey(params: ReserveIntentParams): string {
//     switch (params.type) {
//       case PaymentIntentType.INSTALLMENT:
//         return `INSTALLMENT:${params.installmentId}`;
//       case PaymentIntentType.SUBSCRIPTION:
//         return `SUBSCRIPTION:${params.companyId}`;
//       case PaymentIntentType.ONBOARDING:
//         return `ONBOARDING:${params.onboardingId}`;
//     }
//   }

//   private static isUniqueReservationViolation(err: unknown): boolean {
//     if (
//       err instanceof Prisma.PrismaClientKnownRequestError &&
//       err.code === "P2002"
//     ) {
//       const target = (err.meta?.target as string[] | string | undefined) ?? [];
//       const fields = Array.isArray(target) ? target : [target];
//       return (
//         fields.includes("reservation_key") || fields.includes("reservationKey")
//       );
//     }
//     return false;
//   }

//   static async cancel(intentionId: string, reason?: string) {
//     const intent = await prisma.paymentIntent.findUnique({
//       where: { intentId: intentionId },
//     });

//     if (!intent) {
//       return { cancelled: false, reason: "Intent not found" };
//     }

//     if (
//       intent.status === PaymentInitStatus.SUCCESS ||
//       intent.status === PaymentInitStatus.FAILED ||
//       intent.status === PaymentInitStatus.CANCELLED ||
//       intent.status === PaymentInitStatus.EXPIRED
//     ) {
//       return { cancelled: false, reason: "Intent already terminal" };
//     }

//     await prisma.paymentIntent.update({
//       where: { intentId: intentionId },
//       data: {
//         status: PaymentInitStatus.CANCELLED,
//         authorizationUrl: reason ?? undefined,
//       },
//     });

//     return { cancelled: true };
//   }

//   static async markInitialized(
//     intentId: string,
//     providerData: { reference: string; authorizationUrl: string },
//   ) {
//     const intent = await prisma.paymentIntent.update({
//       where: { intentId },
//       data: {
//         status: PaymentInitStatus.INITIALIZED,
//         reference: providerData.reference,
//         authorizationUrl: providerData.authorizationUrl,
//       },
//     });

//     return intent;
//   }

//   static async markPending(intentId: string) {
//     const intent = await prisma.paymentIntent.update({
//       where: { intentId },
//       data: { status: PaymentInitStatus.PENDING },
//     });

//     return intent;
//   }

//   static async markSuccess(intentId: string) {
//     const intent = await prisma.paymentIntent.update({
//       where: { intentId },
//       data: { status: PaymentInitStatus.SUCCESS },
//     });

//     return intent;
//   }

//   static async markFailed(intentId: string) {
//     const intent = await prisma.paymentIntent.update({
//       where: { intentId },
//       data: { status: PaymentInitStatus.FAILED },
//     });

//     return intent;
//   }

//   static async expireStale() {
//     const now = new Date();

//     const expiredIntents = await prisma.paymentIntent.findMany({
//       where: {
//         status: {
//           in: [PaymentInitStatus.INITIALIZING, PaymentInitStatus.INITIALIZED],
//         },
//         expiresAt: { lt: now },
//       },
//     });

//     const result = await prisma.paymentIntent.updateMany({
//       where: {
//         status: {
//           in: [PaymentInitStatus.INITIALIZING, PaymentInitStatus.INITIALIZED],
//         },
//         expiresAt: { lt: now },
//       },
//       data: { status: PaymentInitStatus.EXPIRED },
//     });

//     return { expiredCount: result.count, expiredIntents };
//   }

//   static async findByReference(reference: string) {
//     return prisma.paymentIntent.findUnique({
//       where: { reference },
//     });
//   }

//   static async findByIdempotencyKey(idempotencyKey: string) {
//     return prisma.paymentIntent.findUnique({
//       where: { idempotencyKey },
//     });
//   }

//   static async findByInstallment(
//     installmentId: string,
//     statuses: PaymentInitStatus[] = [
//       PaymentInitStatus.INITIALIZING,
//       PaymentInitStatus.INITIALIZED,
//       PaymentInitStatus.PENDING,
//     ],
//   ) {
//     return prisma.paymentIntent.findFirst({
//       where: { installmentId, status: { in: statuses } },
//     });
//   }

//   static async findByCompany(
//     companyId: string,
//     statuses: PaymentInitStatus[] = [
//       PaymentInitStatus.INITIALIZING,
//       PaymentInitStatus.INITIALIZED,
//       PaymentInitStatus.PENDING,
//     ],
//   ) {
//     return prisma.paymentIntent.findFirst({
//       where: {
//         companyId,
//         type: PaymentIntentType.SUBSCRIPTION,
//         status: { in: statuses },
//       },
//     });
//   }

//   static async findByOnboarding(
//     onboardingId: string,
//     statuses: PaymentInitStatus[] = [
//       PaymentInitStatus.INITIALIZING,
//       PaymentInitStatus.INITIALIZED,
//       PaymentInitStatus.PENDING,
//     ],
//   ) {
//     return prisma.paymentIntent.findFirst({
//       where: {
//         onboardingId,
//         type: PaymentIntentType.ONBOARDING,
//         status: { in: statuses },
//       },
//     });
//   }

//   private static async findActiveIntent(params: ReserveIntentParams) {
//     const activeStatuses = [
//       PaymentInitStatus.INITIALIZING,
//       PaymentInitStatus.INITIALIZED,
//       PaymentInitStatus.PENDING,
//     ];

//     switch (params.type) {
//       case PaymentIntentType.INSTALLMENT:
//         if (params.installmentId) {
//           return this.findByInstallment(params.installmentId, activeStatuses);
//         }
//         break;
//       case PaymentIntentType.SUBSCRIPTION:
//         if (params.companyId) {
//           return this.findByCompany(params.companyId, activeStatuses);
//         }
//         break;
//       case PaymentIntentType.ONBOARDING:
//         if (params.onboardingId) {
//           return this.findByOnboarding(params.onboardingId, activeStatuses);
//         }
//         break;
//     }

//     return this.findByIdempotencyKey(params.idempotencyKey);
//   }

//   private static getStatusMessage(status: PaymentInitStatus): string {
//     switch (status) {
//       case PaymentInitStatus.INITIALIZING:
//         return "Payment initialization in progress";
//       case PaymentInitStatus.INITIALIZED:
//         return "Payment already initialized, complete the payment";
//       case PaymentInitStatus.PENDING:
//         return "Payment is being processed";
//       default:
//         return "Payment intent exists";
//     }
//   }

//   static async initializePaystack(
//     intentId: string,
//     params: InitializeIntentParams,
//     context?: RequestContext,
//   ) {
//     const intent = await prisma.paymentIntent.findUnique({
//       where: { intentId },
//     });

//     if (!intent) {
//       throw new NotFoundError("Payment intent not found");
//     }

//     try {
//       const providerResponse = await PaystackHttpClient.initializeTransaction({
//         email: params.email,
//         amountKobo: Number(intent.amount) * 100,
//         metadata: {
//           ...params.metadata,
//           paymentIntentId: intent.intentId,
//           type: this.mapMetadataType(intent.type),
//         },
//         callbackUrl: params.callbackUrl,
//         context,
//       });

//       await this.markInitialized(intentId, {
//         reference: providerResponse.reference,
//         authorizationUrl: providerResponse.authorizationUrl,
//       });

//       return {
//         authorizationUrl: providerResponse.authorizationUrl,
//         reference: providerResponse.reference,
//         accessCode: providerResponse.accessCode,
//       };
//     } catch (error: any) {
//       await this.markFailed(intentId);
//       if (error.code === PaystackErrorCode.TIMEOUT) {
//         throw new BadRequestError("Payment provider timeout, please retry");
//       }
//       throw error;
//     }
//   }

//   static async verifyPaystack(reference: string, context?: RequestContext) {
//     const verification = await PaystackHttpClient.verifyTransaction(
//       reference,
//       context,
//     );

//     return verification;
//   }

//   private static mapMetadataType(type: PaymentIntentType): string {
//     switch (type) {
//       case PaymentIntentType.INSTALLMENT:
//         return "installment_payment";
//       case PaymentIntentType.ONBOARDING:
//         return "onboarding_payment";
//       case PaymentIntentType.SUBSCRIPTION:
//         return "company_subscription";
//     }
//   }
// }
