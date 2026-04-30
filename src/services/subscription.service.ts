import { prisma } from "../../prisma/client.js";
import AppError, { BadRequestError, NotFoundError } from "../libs/AppError.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

export class SubscriptionService {
  /**
   * Public: List available plans
   */
  static async getActivePlans() {
    return prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { price: "asc" },
    });
  }

  /**
   * Initialize a Paystack transaction for a subscription
   */
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

    const amount = plan.discountPrice
      ? Number(plan.discountPrice)
      : Number(plan.price);

    // Call Paystack
    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: Math.round(amount * 100), // In kobo
          callback_url: `${process.env.FRONTEND_URL}/subscription/verify`,
          metadata: {
            companyId,
            planId,
            type: "company_subscription",
          },
        }),
      },
    );

    const data = await response.json();
    if (!data.status) {
      throw new BadRequestError(
        data.message || "Paystack initialization failed",
      );
    }

    // Create a pending subscription record
    await prisma.companySubscription.create({
      data: {
        companyId,
        planId,
        status: "PENDING",
      },
    });

    return data.data; // { authorization_url, access_code, reference }
  }

  /**
   * Verify Paystack payment and activate subscription
   */
  static async verifySubscription(reference: string) {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      },
    );

    const data = await response.json();
    if (!data.status || data.data.status !== "success") {
      throw new BadRequestError("Payment verification failed");
    }

    const { companyId, planId } = data.data.metadata;

    // Start Atomic Transaction: Activate Subscription + Ledger Entry
    return prisma.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({ where: { planId } });
      if (!plan) throw new Error("Plan vanished");

      // 1. Calculate dates
      const startDate = new Date();
      const endDate = new Date();
      if (plan.interval === "WEEKLY") endDate.setDate(endDate.getDate() + 7);
      else if (plan.interval === "MONTHLY")
        endDate.setMonth(endDate.getMonth() + 1);
      else if (plan.interval === "YEARLY")
        endDate.setFullYear(endDate.getFullYear() + 1);

      // 2. Update existing pending or create new active subscription
      await tx.companySubscription.updateMany({
        where: { companyId, status: "PENDING" },
        data: {
          status: "ACTIVE",
          startDate,
          endDate,
        },
      });

      // 3. Update Company plan status
      await tx.company.update({
        where: { companyId },
        data: { plan: plan.name },
      });

      // 4. Ledger Entry (Asset: Bank_Settled, Revenue: Platform_Revenue)
      // Note: In a real system, we'd use the company's admin user for the transaction record
      const admin = await tx.user.findFirst({
        where: { companyId, role: "ADMIN" },
      });

      if (admin) {
        await tx.ledgerTransaction.create({
          data: {
            userId: admin.userId,
            type: "CREDIT",
            amount: plan.discountPrice || plan.price,
            referenceId: reference,
            description: `Subscription Payment: ${plan.name}`,
          },
        });
      }

      return { status: "ACTIVE", plan: plan.name };
    });
  }
}
