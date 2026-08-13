import {
  prisma,
  Prisma,
  PaymentIntentType,
  PaymentInitStatus,
  type SubscriptionPlan,
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
      initializationPayload: {
        email: onboardingIntent.email,
        callbackUrl: `${process.env.FRONTEND_URL}/login`,
        metadata: { intentId },
      },
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
      await PaymentIntentService.initializePaystack(intent.intentId, {
        traceId: randomUUID(),
        paymentIntentId: intent.intentId,
      });

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

  /**
   * Shared reservation step for both first-time subscribe and renewal — creates
   * the PaymentIntent + a PENDING CompanySubscription row and initializes the
   * Paystack transaction. Returns an in-flight PENDING intent's link as-is if
   * one already exists (idempotent for repeated clicks/requests).
   */
  private static async createPendingSubscriptionAndIntent(
    companyId: string,
    plan: SubscriptionPlan,
    email: string,
  ) {
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
      initializationPayload: {
        email,
        callbackUrl: `${process.env.FRONTEND_URL}/subscription/verify`,
        metadata: {
          companyId,
          planId: plan.planId,
        },
      },
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
            { companyId, planId: plan.planId },
          );
        } else {
          throw err;
        }
      }
    }

    const { authorization_url, reference, access_code } =
      await PaymentIntentService.initializePaystack(intent.intentId, {
        traceId: randomUUID(),
        paymentIntentId: intent.intentId,
      });

    await PaymentIntentService.markPending(intent.intentId);

    return { authorization_url, access_code, reference };
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

    return this.createPendingSubscriptionAndIntent(companyId, plan, email);
  }

  /**
   * Click-to-renew — triggered from a reminder email link, not auto-charged
   * (no stored Paystack authorization/card token exists in this codebase).
   * Defaults to the company's current plan if none is specified.
   */
  static async renewSubscription(companyId: string, planId?: string) {
    const company = await prisma.user.findFirst({
      where: { companyId, role: "COMPANY" },
      select: { email: true },
    });

    if (!company) {
      throw new NotFoundError("Company owner not found for this company.");
    }

    let targetPlanId = planId;

    if (!targetPlanId) {
      const currentSubscription = await prisma.companySubscription.findFirst({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });

      if (!currentSubscription) {
        throw new BadRequestError(
          "No existing subscription found — use initializeSubscription instead.",
        );
      }

      targetPlanId = currentSubscription.planId;
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planId: targetPlanId },
    });

    if (!plan || !plan.active) {
      throw new NotFoundError("Subscription plan not found or inactive");
    }

    return this.createPendingSubscriptionAndIntent(
      companyId,
      plan,
      company.email,
    );
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

      // Defensive: a late webhook racing the grace-period scheduler must
      // never leave two non-expired rows for one company — expire everything
      // else first, then activate the new one.
      await tx.companySubscription.updateMany({
        where: {
          companyId,
          subscriptionId: { not: pendingSubscription.subscriptionId },
          status: { not: "EXPIRED" },
        },
        data: { status: "EXPIRED" },
      });

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
