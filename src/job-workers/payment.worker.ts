import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import {
  prisma,
  AccountType,
  InstallmentStatus,
  PaymentStatus,
  CommissionStatus,
} from "@/infrastructure/prisma";
import { LedgerService } from "@/core/services/ledger.service";
import { QueueNames } from "@/infrastructure/redis/constant";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";
import { Prisma } from "@/infrastructure/prisma";

export const paymentWorker = new Worker(
  QueueNames.PaymentQueue,
  async (job) => {
    const { installmentId, amount, reference, gatewayRef } = job.data;

    console.log(
      `[payment-worker] Processing job reference=${reference} installmentId=${installmentId}`,
    );

    // Retrieve Installment and target customer + product details
    const installment = await prisma.installment.findUnique({
      where: { installmentId },
      include: {
        product: true,
        user: {
          select: {
            userId: true,
            name: true,
            email: true,
            referredByMarketerId: true,
            companyId: true,
          },
        },
      },
    });

    if (!installment) {
      throw new Error(`Installment not found: ${installmentId}`);
    }

    if (installment.status === InstallmentStatus.PAID) {
      console.log(
        `[payment-worker] Installment ${installmentId} is already PAID. Skipping.`,
      );
      return { message: "Already processed" };
    }

    // Process atomically inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark installment as PAID
      const updatedInstallment = await tx.installment.update({
        where: { installmentId },
        data: { status: InstallmentStatus.PAID },
      });

      // 2. Log successful Payment record
      const payment = await tx.payment.create({
        data: {
          installmentId: installment.installmentId,
          amount: new Prisma.Decimal(amount),
          status: PaymentStatus.SUCCESS,
          gatewayRef: gatewayRef || reference,
          idempotencyKey: reference,
        },
      });

      // 3. Compute and accrue marketer commission
      let commissionRecord = null;
      let commissionAmount = new Prisma.Decimal(0);

      const marketerId = installment.user.referredByMarketerId;
      const commissionRate = installment.product.commissionRate || 0;

      if (marketerId && Prisma.Decimal(commissionRate).greaterThan(0)) {
        commissionAmount = installment.amount.times(
          new Prisma.Decimal(commissionRate).div(100),
        );

        commissionRecord = await tx.commission.create({
          data: {
            userId: marketerId,
            paymentId: payment.paymentId,
            amount: commissionAmount,
            status: CommissionStatus.PENDING,
          },
        });
        console.log(
          `[payment-worker] Accrued commission for marketer ${marketerId}: ${commissionAmount} (Rate: ${commissionRate}%)`,
        );
      }

      // 4. Record dynamic balanced ledger transactions
      await LedgerService.recordTransaction(
        {
          reference,
          description: `Installment Payment for product ${installment.product.name} by customer ${installment.user.name || installment.user.email}`,
          companyId: installment.user.companyId || undefined,
          entries: [
            {
              accountName: "PAYSTACK_CLEARING",
              accountType: AccountType.ASSET,
              debit: installment.amount,
            },
            {
              accountName: "CUSTOMER_RECEIVABLE",
              accountType: AccountType.ASSET,
              credit: installment.amount,
            },
            ...(commissionAmount.greaterThan(0)
              ? [
                  {
                    accountName: "COMMISSION_EXPENSE",
                    accountType: AccountType.EXPENSE,
                    debit: commissionAmount,
                  },
                  {
                    accountName: "COMMISSION_PAYABLE",
                    accountType: AccountType.LIABILITY,
                    credit: commissionAmount,
                  },
                ]
              : []),
          ],
        },
        tx,
      );

      // 5. Calculate customer's product financing percentage progress
      const allInstallments = await tx.installment.findMany({
        where: {
          userId: installment.userId,
          productId: installment.productId,
        },
        select: {
          amount: true,
          status: true,
        },
      });

      let totalFinanced = new Prisma.Decimal(0);
      let totalPaid = new Prisma.Decimal(0);

      for (const inst of allInstallments) {
        totalFinanced = totalFinanced.plus(inst.amount);
        if (inst.status === InstallmentStatus.PAID) {
          totalPaid = totalPaid.plus(inst.amount);
        }
      }

      const percentagePaid = totalFinanced.isZero()
        ? 0
        : Number(totalPaid.div(totalFinanced).times(100).toFixed(2));

      // Find next pending installment due date
      const nextPending = await tx.installment.findFirst({
        where: {
          userId: installment.userId,
          productId: installment.productId,
          status: InstallmentStatus.PENDING,
        },
        orderBy: { dueDate: "asc" },
      });

      const nextDueDateString = nextPending
        ? nextPending.dueDate.toLocaleDateString()
        : "Fully Financed! 🎉";

      return {
        payment,
        commissionRecord,
        percentagePaid,
        nextDueDateString,
      };
    });

    // 5. Emit event to trigger notifications asynchronously
    emitEvent(DomainEvent.INSTALLMENT_PAID, {
      email: installment.user.email,
      customerName: installment.user.name || "Financing Customer",
      productName: installment.product.name,
      amountPaid: amount,
      dueDate: result.nextDueDateString,
      percentagePaid: result.percentagePaid,
      dashboard_url: process.env.FRONTEND_URL,
    });

    console.log(
      `[payment-worker] ✓ Successfully processed reference=${reference} percentagePaid=${result.percentagePaid}%`,
    );

    return result;
  },
  {
    connection: redis,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
);

paymentWorker.on("completed", (job) => {
  console.log(`✅ Payment job completed: ${job.id}`);
});

paymentWorker.on("failed", (job, err) => {
  console.error(`❌ Payment job failed: ${job?.id} error:`, err);
});
