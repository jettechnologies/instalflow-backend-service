import { Worker } from "bullmq";
import { redis } from "@/config/redis-config/redis-connect";
import { prisma, AccountType } from "@/prisma/client";
import { SubscriptionService } from "../services/subscription.service";
import { LedgerService } from "@/services/ledger.service";
import { QueueNames } from "@/config/redis-config/constant";
import { emitEvent } from "@/events/emitter";
import { DomainEvent } from "@/events/event.types";

export const onboardingWorker = new Worker(
  QueueNames.OnboardingQueue,
  async (job) => {
    const { intentId, reference } = job.data;

    const intent = await prisma.onboardingIntent.findUnique({
      where: { intentId },
    });

    if (!intent) throw new Error("Intent not found");

    if (intent.status === "COMPLETED") {
      return { message: "Already processed" };
    }

    // 🔒 Verify payment
    const transaction =
      await SubscriptionService.validatePaystackTransaction(reference);

    if (transaction.status !== "success") {
      throw new Error("Payment not successful");
    }

    // return prisma.$transaction(async (tx) => {
    //   const existingUser = await tx.user.findUnique({
    //     where: { email: intent.email },
    //   });

    //   if (existingUser) {
    //     await tx.onboardingIntent.update({
    //       where: { intentId },
    //       data: { status: "COMPLETED" },
    //     });
    //     return;
    //   }

    //   const company = await tx.company.create({
    //     data: { name: intent.companyName, plan: "Pending" },
    //   });

    //   const user = await tx.user.create({
    //     data: {
    //       email: intent.email,
    //       password: intent.passwordHash,
    //       name: intent.adminName,
    //       role: "COMPANY",
    //       companyId: company.companyId,
    //     },
    //   });

    //   const plan = await tx.subscriptionPlan.findUnique({
    //     where: { planId: intent.planId },
    //   });

    //   const startDate = new Date();
    //   const endDate = new Date();
    //   if (plan!.interval === "MONTHLY") {
    //     endDate.setMonth(endDate.getMonth() + 1);
    //   }

    //   await tx.companySubscription.create({
    //     data: {
    //       companyId: company.companyId,
    //       planId: plan!.planId,
    //       status: "ACTIVE",
    //       startDate,
    //       endDate,
    //     },
    //   });

    //   await tx.company.update({
    //     where: { companyId: company.companyId },
    //     data: { plan: plan!.name },
    //   });

    //   await LedgerService.recordTransaction(
    //     {
    //       reference,
    //       description: "Onboarding Subscription",
    //       companyId: company.companyId,
    //       entries: [
    //         {
    //           accountName: "PAYSTACK_CLEARING",
    //           accountType: AccountType.ASSET,
    //           debit: plan!.price,
    //         },
    //         {
    //           accountName: "PLATFORM_REVENUE",
    //           accountType: AccountType.REVENUE,
    //           credit: plan!.price,
    //         },
    //       ],
    //     },
    //     tx,
    //   );

    //   await tx.onboardingIntent.update({
    //     where: { intentId },
    //     data: { status: "COMPLETED" },
    //   });

    //   // ✅ Fires → notification-hub → email_queue → email-worker → Brevo (company-onboarding)
    //   emitEvent(DomainEvent.COMPANY_ONBOARDED, {
    //     adminName: user.name,
    //     companyName: company.name,
    //     dashboard_url: process.env.FRONTEND_URL,
    //   });

    //   return { company, user };
    // });

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: intent.email },
      });

      if (existingUser) {
        await tx.onboardingIntent.update({
          where: { intentId },
          data: { status: "COMPLETED" },
        });

        return null;
      }

      const company = await tx.company.create({
        data: { name: intent.companyName, plan: "Pending" },
      });

      const user = await tx.user.create({
        data: {
          email: intent.email,
          password: intent.passwordHash,
          name: intent.adminName,
          role: "COMPANY",
          companyId: company.companyId,
        },
      });

      const plan = await tx.subscriptionPlan.findUnique({
        where: { planId: intent.planId },
      });

      const startDate = new Date();
      const endDate = new Date();

      if (plan!.interval === "MONTHLY") {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      await tx.companySubscription.create({
        data: {
          companyId: company.companyId,
          planId: plan!.planId,
          status: "ACTIVE",
          startDate,
          endDate,
        },
      });

      await tx.company.update({
        where: { companyId: company.companyId },
        data: { plan: plan!.name },
      });

      await LedgerService.recordTransaction(
        {
          reference,
          description: "Onboarding Subscription",
          companyId: company.companyId,
          entries: [
            {
              accountName: "PAYSTACK_CLEARING",
              accountType: AccountType.ASSET,
              debit: plan!.price,
            },
            {
              accountName: "PLATFORM_REVENUE",
              accountType: AccountType.REVENUE,
              credit: plan!.price,
            },
          ],
        },
        tx,
      );

      await tx.onboardingIntent.update({
        where: { intentId },
        data: { status: "COMPLETED" },
      });

      return { company, user };
    });

    if (result) {
      emitEvent(DomainEvent.COMPANY_ONBOARDED, {
        adminName: result.user.name,
        companyName: result.company.name,
        dashboard_url: process.env.FRONTEND_URL,
      });
    }

    return result;
  },
  {
    connection: redis,
    concurrency: 5,
  },
);

onboardingWorker.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

onboardingWorker.on("failed", async (job) => {
  if (job && job?.attemptsMade === job?.opts.attempts) {
    await prisma.onboardingIntent.update({
      where: { intentId: job?.data.intentId },
      data: { status: "FAILED" },
    });
  }
});
