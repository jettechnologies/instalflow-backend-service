import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";

import {
  prisma,
  Prisma,
  AccountType,
  InstallmentStatus,
  PaymentStatus,
  CommissionStatus,
  FinancingStatus,
} from "@/infrastructure/prisma";

import { LedgerService } from "@/core/services/ledger.service";

import { QueueNames } from "@/infrastructure/redis/constant";

import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";

export const paymentWorker = new Worker(
  QueueNames.PaymentQueue,

  async (job) => {
    const { installmentId, amount, reference, gatewayRef } = job.data;

    console.log(
      `[payment-worker] Processing reference=${reference} installment=${installmentId}`,
    );

    const installment = await prisma.installment.findUnique({
      where: {
        installmentId,
      },

      include: {
        financingContract: {
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
        },
      },
    });

    if (!installment) {
      throw new Error(`Installment not found: ${installmentId}`);
    }

    if (installment.status === InstallmentStatus.PAID) {
      console.log(
        `[payment-worker] Installment already paid: ${installmentId}`,
      );

      return {
        success: true,
        message: "Installment already processed",
      };
    }

    const contract = installment.financingContract;

    const result = await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findFirst({
        where: {
          installmentId: installment.installmentId,
          idempotencyKey: reference,
          status: PaymentStatus.PENDING,
        },
      });

      let payment;

      if (existingPayment) {
        payment = await tx.payment.update({
          where: {
            paymentId: existingPayment.paymentId,
          },

          data: {
            status: PaymentStatus.SUCCESS,
            providerReference: gatewayRef || reference,
          },
        });
      } else {
        payment = await tx.payment.create({
          data: {
            installmentId: installment.installmentId,

            amount: new Prisma.Decimal(amount),

            status: PaymentStatus.SUCCESS,

            providerReference: gatewayRef || reference,

            idempotencyKey: reference,
          },
        });
      }

      const updatedInstallment = await tx.installment.update({
        where: {
          installmentId,
        },

        data: {
          status: InstallmentStatus.PAID,
          paidAt: new Date(),
        },
      });

      let commissionRecord = null;

      let commissionAmount = new Prisma.Decimal(0);

      const marketerId = contract.user.referredByMarketerId;

      const commissionRate = contract.product.commissionRate || 0;

      if (marketerId && new Prisma.Decimal(commissionRate).greaterThan(0)) {
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
          `[payment-worker] Commission accrued marketer=${marketerId} amount=${commissionAmount}`,
        );
      }

      await LedgerService.recordTransaction(
        {
          reference,

          description: `Installment payment for contract ${contract.contractId}`,

          companyId: contract.user.companyId || undefined,

          metadata: {
            installmentId: installment.installmentId,
            contractId: contract.contractId,
            paymentId: payment.paymentId,
          },

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

      const allInstallments = await tx.installment.findMany({
        where: {
          financingContractId: contract.contractId,
        },

        orderBy: {
          sequence: "asc",
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

      const nextPending = await tx.installment.findFirst({
        where: {
          financingContractId: contract.contractId,

          status: InstallmentStatus.PENDING,
        },

        orderBy: {
          sequence: "asc",
        },
      });

      let updatedContractStatus = contract.status;

      if (!nextPending) {
        await tx.financingContract.update({
          where: {
            contractId: contract.contractId,
          },

          data: {
            status: FinancingStatus.COMPLETED,

            completedAt: new Date(),
          },
        });

        updatedContractStatus = FinancingStatus.COMPLETED;
      }

      return {
        payment,
        updatedInstallment,
        commissionRecord,
        percentagePaid,
        nextDueDate: nextPending?.dueDate || null,
        financingStatus: updatedContractStatus,
      };
    });

    emitEvent(DomainEvent.INSTALLMENT_PAID, {
      email: contract.user.email,
      customerName: contract.user.name || "Financing Customer",
      productName: contract.product.name,
      amountPaid: amount,
      percentagePaid: result.percentagePaid,
      nextDueDate: result.nextDueDate?.toISOString() || "N/A",
      dashboard_url: process.env.FRONTEND_URL,
    });

    console.log(
      `[payment-worker] SUCCESS reference=${reference} progress=${result.percentagePaid}%`,
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
  console.error(`❌ Payment job failed: ${job?.id}`, err);
});
