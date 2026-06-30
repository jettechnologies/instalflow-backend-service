import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";
import { prisma, Prisma, AccountType } from "@/infrastructure/prisma";
import logger from "@/infrastructure/logger/logger";

interface ReconciliationResult {
  accountId: number;
  accountName: string;
  companyId: string | null;
  storedBalance: string;
  computedBalance: string;
  discrepancy: boolean;
  corrected: boolean;
  reconciledAt: string;
}

function computeCanonicalBalance(
  accountType: AccountType,
  entries: { debit: Prisma.Decimal; credit: Prisma.Decimal }[],
): Prisma.Decimal {
  return entries.reduce((sum, entry) => {
    const debit = new Prisma.Decimal(entry.debit);
    const credit = new Prisma.Decimal(entry.credit);

    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        return sum.plus(debit).minus(credit);

      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        return sum.plus(credit).minus(debit);

      default:
        return sum;
    }
  }, new Prisma.Decimal(0));
}

const redisKey = (accountId: bigint) =>
  `ledger:reconciliation:account:${accountId}`;

const SUMMARY_KEY = "ledger:reconciliation:latest_summary";

export const ledgerReconciliationWorker = new Worker(
  QueueNames.LedgerReconciliationQueue,

  async (job) => {
    logger.info(
      `[LedgerReconciliation] Starting reconciliation scan (job ${job.id ?? "manual"})…`,
    );

    const reconciledAt = new Date();

    const accounts = await prisma.ledgerAccount.findMany({
      include: {
        entries: {
          select: { debit: true, credit: true },
        },
      },
    });

    let discrepancies = 0;
    const results: ReconciliationResult[] = [];

    for (const account of accounts) {
      const computedBalance = computeCanonicalBalance(
        account.type as AccountType,
        account.entries,
      );

      const storedBalance = new Prisma.Decimal(account.balance);
      const hasDiscrepancy = !computedBalance.equals(storedBalance);

      if (hasDiscrepancy) {
        discrepancies++;
        logger.error(
          `[LedgerReconciliation] DISCREPANCY — Account "${account.name}" ` +
            `(id=${account.id}, companyId=${account.companyId ?? "global"}): ` +
            `stored=${storedBalance.toFixed(4)}, computed=${computedBalance.toFixed(4)}, ` +
            `drift=${computedBalance.minus(storedBalance).toFixed(4)}`,
        );

        await prisma.ledgerAccount.update({
          where: { id: account.id },
          data: {
            balance: computedBalance,
            lastReconciledAt: reconciledAt,
          },
        });
      } else {
        await prisma.ledgerAccount.update({
          where: { id: account.id },
          data: { lastReconciledAt: reconciledAt },
        });
      }

      const result: ReconciliationResult = {
        accountId: Number(account.id),
        accountName: account.name,
        companyId: account.companyId,
        storedBalance: storedBalance.toFixed(4),
        computedBalance: computedBalance.toFixed(4),
        discrepancy: hasDiscrepancy,
        corrected: hasDiscrepancy,
        reconciledAt: reconciledAt.toISOString(),
      };

      results.push(result);

      await redis.set(
        redisKey(account.id),
        JSON.stringify(result),
        "EX",
        25 * 60 * 60,
      );
    }

    const summary = {
      totalAccounts: accounts.length,
      discrepancies,
      reconciledAt: reconciledAt.toISOString(),
    };

    await redis.set(SUMMARY_KEY, JSON.stringify(summary), "EX", 25 * 60 * 60);

    logger.info(
      `[LedgerReconciliation] Complete — ` +
        `${discrepancies} discrepancy(ies) found and corrected ` +
        `across ${accounts.length} account(s).`,
    );

    return summary;
  },

  {
    connection: redis,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 60_000,
    },
  },
);

ledgerReconciliationWorker.on("completed", (job) => {
  logger.info(`✅ [LedgerReconciliation] Job ${job.id} completed.`);
});

ledgerReconciliationWorker.on("failed", (job, err) => {
  logger.error(
    `❌ [LedgerReconciliation] Job ${job?.id} failed: ${err.message}`,
  );
});
