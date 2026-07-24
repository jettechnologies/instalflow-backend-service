import {
  prisma,
  Prisma,
  PaymentIntentType,
  PaymentInitStatus,
} from "@/infrastructure/prisma";
import { BadRequestError, NotFoundError } from "@/shared/utils/AppError";
import { LedgerService } from "./ledger.service";
import { AccountType } from "@/infrastructure/prisma";
import { PaymentIntentService } from "./payment-intent.service";
import { randomUUID } from "crypto";
import logger from "@/infrastructure/logger/logger";

export class SubscriptionService {
  static async getActivePlans() {
    return prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { price: "asc" },
    });
  }

  static async initializeOnboardingPayment(intentId: string) {
    const onboardingIntent = await prisma.onboardingIntent.findUnique({
      where: { intentId },
      include: { plan: true },
    });

    if (!onboardingIntent)
      throw new NotFoundError("Onboarding intent not found");
    if (!onboardingIntent.plan) throw new NotFoundError("Plan not found");

    const plan = onboardingIntent.plan;
    const amount =
      plan.discountPrice && Number(plan.discountPrice) > 0
        ? Number(plan.discountPrice)
        : Number(plan.price);

    const idempotencyKey = randomUUID();

    const { intent, isExisting } = await PaymentIntentService.reserve({
      type: PaymentIntentType.ONBOARDING,
      amount,
      onboardingId: intentId,
      planId: onboardingIntent.planId,
      idempotencyKey,
    });

    if (
      isExisting &&
      (intent.status === PaymentInitStatus.INITIALIZED ||
        intent.status === PaymentInitStatus.PENDING)
    ) {
      return {
        authorization_url: intent.authorizationUrl ?? "",
        access_code: "",
        reference: intent.reference ?? "",
      };
    }

    const { authorization_url, reference, access_code } =
      await PaymentIntentService.initializePaystack(
        intent.intentId,
        {
          email: onboardingIntent.email,
          metadata: { intentId },
          callbackUrl: `${process.env.FRONTEND_URL}/login`,
        },
        {
          traceId: randomUUID(),
          paymentIntentId: intent.intentId,
        },
      );

    await PaymentIntentService.markPending(intent.intentId);

    await prisma.onboardingIntent.update({
      where: { intentId },
      data: {
        paymentReference: reference,
        status: "PAYMENT_INITIALIZED",
      },
    });

    return {
      authorization_url,
      access_code,
      reference,
    };
  }

  static async initializeSubscription(
    companyId: string,
    planId: string,
    email: string,
  ) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planId },
    });

    if (!plan || !plan.active) {
      throw new NotFoundError("Subscription plan not found or inactive");
    }

    const amount =
      plan.discountPrice && Number(plan.discountPrice) > 0
        ? Number(plan.discountPrice)
        : Number(plan.price);

    const idempotencyKey = randomUUID();

    const { intent, isExisting } = await PaymentIntentService.reserve({
      type: PaymentIntentType.SUBSCRIPTION,
      amount,
      companyId,
      idempotencyKey,
      planId: plan.planId,
    });

    if (
      isExisting &&
      (intent.status === PaymentInitStatus.INITIALIZED ||
        intent.status === PaymentInitStatus.PENDING)
    ) {
      return {
        authorization_url: intent.authorizationUrl ?? "",
        access_code: "",
        reference: intent.reference ?? "",
      };
    }

    if (!isExisting) {
      try {
        await prisma.companySubscription.create({
          data: {
            companyId,
            planId: plan.planId,
            status: "PENDING",
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          logger.warn(
            "[subscription] PENDING CompanySubscription already exists, continuing",
            { companyId, planId },
          );
        } else {
          throw err;
        }
      }
    }

    const { authorization_url, reference, access_code } =
      await PaymentIntentService.initializePaystack(
        intent.intentId,
        {
          email,
          callbackUrl: `${process.env.FRONTEND_URL}/subscription/verify`,
          metadata: {
            companyId,
            planId,
          },
        },
        {
          traceId: randomUUID(),
          paymentIntentId: intent.intentId,
        },
      );

    await PaymentIntentService.markPending(intent.intentId);

    return { authorization_url, access_code, reference };
  }

  static async validatePaystackTransaction(reference: string) {
    const intent = await PaymentIntentService.findByReference(reference);
    if (!intent) {
      throw new BadRequestError("Payment intent not found for reference");
    }

    const verification = await PaymentIntentService.verifyPaystack(reference);
    if (verification.status !== "success") {
      throw new BadRequestError("Payment verification failed or incomplete");
    }

    return verification;
  }

  static async verifySubscription(reference: string) {
    const intent = await PaymentIntentService.findByReference(reference);
    if (!intent) {
      throw new BadRequestError("Payment intent not found");
    }

    await this.validatePaystackTransaction(reference);

    const companyId = intent.companyId!;
    const planId = intent.planId!;

    return prisma.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({ where: { planId } });
      if (!plan) throw new Error("Plan vanished");

      const pendingSubscription = await tx.companySubscription.findFirst({
        where: { companyId, status: "PENDING" },
      });

      if (!pendingSubscription) {
        logger.error(
          "[subscription] No PENDING CompanySubscription found for company at verification time — aborting",
          { companyId, planId, reference },
        );
        throw new BadRequestError(
          "No pending subscription found for this company",
        );
      }

      const startDate = new Date();
      const endDate = new Date();
      if (plan.interval === "WEEKLY") endDate.setDate(endDate.getDate() + 7);
      else if (plan.interval === "MONTHLY")
        endDate.setMonth(endDate.getMonth() + 1);
      else if (plan.interval === "YEARLY")
        endDate.setFullYear(endDate.getFullYear() + 1);

      await tx.companySubscription.update({
        where: { subscriptionId: pendingSubscription.subscriptionId },
        data: {
          status: "ACTIVE",
          startDate,
          endDate,
        },
      });

      await tx.company.update({
        where: { companyId },
        data: { plan: plan.name },
      });

      await PaymentIntentService.markSuccess(intent.intentId);

      await LedgerService.recordTransaction(
        {
          reference: reference,
          description: `Subscription Payment: ${plan.name}`,
          companyId: companyId,
          entries: [
            {
              accountName: "PAYSTACK_CLEARING",
              accountType: AccountType.ASSET,
              debit: plan.discountPrice || plan.price,
            },
            {
              accountName: "PLATFORM_REVENUE",
              accountType: AccountType.REVENUE,
              credit: plan.discountPrice || plan.price,
            },
          ],
        },
        tx,
      );

      return { status: "ACTIVE", plan: plan.name };
    });
  }
}

// import {
//   prisma,
//   PaymentIntentType,
//   PaymentInitStatus,
// } from "@/infrastructure/prisma";
// import { BadRequestError, NotFoundError } from "@/shared/utils/AppError";
// import { LedgerService } from "./ledger.service";
// import { AccountType } from "@/infrastructure/prisma";
// import { PaymentIntentService } from "./payment-intent.service";
// import { randomUUID } from "crypto";

// export class SubscriptionService {
//   static async getActivePlans() {
//     return prisma.subscriptionPlan.findMany({
//       where: { active: true },
//       orderBy: { price: "asc" },
//     });
//   }

//   static async initializeOnboardingPayment(intentId: string) {
//     const onboardingIntent = await prisma.onboardingIntent.findUnique({
//       where: { intentId },
//       include: { plan: true },
//     });

//     if (!onboardingIntent)
//       throw new NotFoundError("Onboarding intent not found");
//     if (!onboardingIntent.plan) throw new NotFoundError("Plan not found");

//     const plan = onboardingIntent.plan;
//     const amount = plan.discountPrice
//       ? Number(plan.discountPrice)
//       : Number(plan.price);

//     const idempotencyKey = randomUUID();

//     const { intent, isExisting } = await PaymentIntentService.reserve({
//       type: PaymentIntentType.ONBOARDING,
//       amount,
//       onboardingId: intentId,
//       planId: onboardingIntent.planId,
//       idempotencyKey,
//     });

//     if (isExisting && intent.status === PaymentInitStatus.INITIALIZED) {
//       return {
//         authorizationUrl: intent.authorizationUrl!,
//         accessCode: "",
//         reference: intent.reference!,
//       };
//     }

//     const { authorizationUrl, reference, accessCode } =
//       await PaymentIntentService.initializePaystack(intent.intentId, {
//         email: onboardingIntent.email,
//         metadata: { intentId },
//       });

//     await PaymentIntentService.markPending(intent.intentId);

//     await prisma.onboardingIntent.update({
//       where: { intentId },
//       data: {
//         paymentReference: reference,
//         status: "PAYMENT_INITIALIZED",
//       },
//     });

//     return {
//       authorizationUrl,
//       accessCode,
//       reference,
//     };
//   }

//   static async initializeSubscription(
//     companyId: string,
//     planId: string,
//     email: string,
//   ) {
//     const plan = await prisma.subscriptionPlan.findUnique({
//       where: { planId },
//     });

//     if (!plan || !plan.active) {
//       throw new NotFoundError("Subscription plan not found or inactive");
//     }

//     const amount = plan.discountPrice
//       ? Number(plan.discountPrice)
//       : Number(plan.price);

//     const idempotencyKey = randomUUID();

//     const { intent, isExisting } = await PaymentIntentService.reserve({
//       type: PaymentIntentType.SUBSCRIPTION,
//       amount,
//       companyId,
//       idempotencyKey,
//       planId: plan.planId,
//       subcriptionId: plan.subscriptionId
//     });

//     if (isExisting && intent.status === PaymentInitStatus.INITIALIZED) {
//       return {
//         authorizationUrl: intent.authorizationUrl!,
//         accessCode: "",
//         reference: intent.reference!,
//       };
//     }

//     const { authorizationUrl, reference, accessCode } =
//       await PaymentIntentService.initializePaystack(intent.intentId, {
//         email,
//         callbackUrl: `${process.env.FRONTEND_URL}/subscription/verify`,
//         metadata: {
//           companyId,
//           planId,
//         },
//       });

//     await PaymentIntentService.markPending(intent.intentId);

//     return { authorizationUrl, accessCode, reference };
//   }

//   static async validatePaystackTransaction(reference: string) {
//     const intent = await PaymentIntentService.findByReference(reference);
//     if (!intent) {
//       throw new BadRequestError("Payment intent not found for reference");
//     }

//     const verification = await PaymentIntentService.verifyPaystack(reference);
//     if (verification.status !== "success") {
//       throw new BadRequestError("Payment verification failed or incomplete");
//     }

//     return verification;
//   }

//   static async verifySubscription(reference: string) {
//     const intent = await PaymentIntentService.findByReference(reference);
//     if (!intent) {
//       throw new BadRequestError("Payment intent not found");
//     }

//     const transaction = await this.validatePaystackTransaction(reference);

//     const companyId = intent.companyId!;
//     const planId = intent.subscriptionId!;

//     return prisma.$transaction(async (tx) => {
//       const plan = await tx.subscriptionPlan.findUnique({ where: { planId } });
//       if (!plan) throw new Error("Plan vanished");

//       const startDate = new Date();
//       const endDate = new Date();
//       if (plan.interval === "WEEKLY") endDate.setDate(endDate.getDate() + 7);
//       else if (plan.interval === "MONTHLY")
//         endDate.setMonth(endDate.getMonth() + 1);
//       else if (plan.interval === "YEARLY")
//         endDate.setFullYear(endDate.getFullYear() + 1);

//       await tx.companySubscription.updateMany({
//         where: { companyId, status: "PENDING" },
//         data: {
//           status: "ACTIVE",
//           startDate,
//           endDate,
//         },
//       });

//       await tx.company.update({
//         where: { companyId },
//         data: { plan: plan.name },
//       });

//       await PaymentIntentService.markSuccess(intent.intentId);

//       await LedgerService.recordTransaction(
//         {
//           reference: reference,
//           description: `Subscription Payment: ${plan.name}`,
//           companyId: companyId,
//           entries: [
//             {
//               accountName: "PAYSTACK_CLEARING",
//               accountType: AccountType.ASSET,
//               debit: plan.discountPrice || plan.price,
//             },
//             {
//               accountName: "PLATFORM_REVENUE",
//               accountType: AccountType.REVENUE,
//               credit: plan.discountPrice || plan.price,
//             },
//           ],
//         },
//         tx,
//       );

//       return { status: "ACTIVE", plan: plan.name };
//     });
//   }
// }
