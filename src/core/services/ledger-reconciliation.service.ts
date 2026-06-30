// src/core/services/ledger-reconciliation.service.ts
// Reads ledger reconciliation results from the Redis cache written by the
// ledger-reconciliation worker. Falls back gracefully when cache is cold.

import { redis } from "@/infrastructure/redis/redis-connect";
import { prisma } from "@/infrastructure/prisma";
import { NotFoundError } from "@/shared/utils/AppError";

// ─── Shared Redis key helpers (mirror of worker) ──────────────────────────────

const ACCOUNT_KEY = (accountId: number | string) =>
  `ledger:reconciliation:account:${accountId}`;

const SUMMARY_KEY = "ledger:reconciliation:latest_summary";

// ─── Response shape types ─────────────────────────────────────────────────────

export interface AccountReconciliationResult {
  accountId: number;
  accountName: string;
  companyId: string | null;
  storedBalance: string;
  computedBalance: string;
  discrepancy: boolean;
  corrected: boolean;
  reconciledAt: string;
}

export interface ReconciliationSummary {
  totalAccounts: number;
  discrepancies: number;
  reconciledAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class LedgerReconciliationService {
  /**
   * Returns the most recent reconciliation run summary.
   * Served from Redis cache; if cache is cold (worker has never run or TTL
   * expired) returns a `cacheStatus: "cold"` indicator so the caller can
   * inform the dashboard to check back after the next scheduled run.
   */
  static async getSummary(): Promise<
    | (ReconciliationSummary & { cacheStatus: "hot" })
    | { cacheStatus: "cold"; message: string }
  > {
    const raw = await redis.get(SUMMARY_KEY);

    if (!raw) {
      return {
        cacheStatus: "cold",
        message:
          "Reconciliation cache is empty. The first run is scheduled daily at 02:00. " +
          "Trigger a manual run or wait for the scheduled job.",
      };
    }

    const summary: ReconciliationSummary = JSON.parse(raw);
    return { ...summary, cacheStatus: "hot" };
  }

  /**
   * Returns the full list of per-account reconciliation results for the
   * latest run. Reads all cached account keys; if the cache is cold for
   * any account, falls back to a lightweight DB query for that account's
   * stored metadata (balance will show as "unchecked").
   *
   * Supports optional filters:
   *   - `discrepancyOnly`: return only accounts that had drift
   *   - `companyId`: filter by company scope (null = global accounts)
   */
  static async getAllAccountResults(filters?: {
    discrepancyOnly?: boolean;
    companyId?: string | "global";
  }): Promise<{
    cacheStatus: "hot" | "partial" | "cold";
    accounts: AccountReconciliationResult[];
    totalReturned: number;
  }> {
    // Fetch all LedgerAccount IDs from DB (lightweight — IDs only)
    const dbAccounts = await prisma.ledgerAccount.findMany({
      select: { id: true, name: true, companyId: true, balance: true },
    });

    if (!dbAccounts.length) {
      return { cacheStatus: "hot", accounts: [], totalReturned: 0 };
    }

    const results: AccountReconciliationResult[] = [];
    let coldCount = 0;

    for (const dbAccount of dbAccounts) {
      const cached = await redis.get(ACCOUNT_KEY(Number(dbAccount.id)));

      if (cached) {
        results.push(JSON.parse(cached) as AccountReconciliationResult);
      } else {
        // Cache miss — synthesise a stub from DB metadata
        coldCount++;
        results.push({
          accountId: Number(dbAccount.id),
          accountName: dbAccount.name,
          companyId: dbAccount.companyId,
          storedBalance: dbAccount.balance.toString(),
          computedBalance: "unchecked",
          discrepancy: false,
          corrected: false,
          reconciledAt: "never",
        });
      }
    }

    // Apply filters
    let filtered = results;

    if (filters?.discrepancyOnly) {
      filtered = filtered.filter((a) => a.discrepancy);
    }

    if (filters?.companyId !== undefined) {
      const target =
        filters.companyId === "global" ? null : filters.companyId;
      filtered = filtered.filter((a) => a.companyId === target);
    }

    const cacheStatus =
      coldCount === 0
        ? "hot"
        : coldCount === dbAccounts.length
          ? "cold"
          : "partial";

    return {
      cacheStatus,
      accounts: filtered,
      totalReturned: filtered.length,
    };
  }

  /**
   * Returns the reconciliation result for a single ledger account by its
   * numeric ID. Reads from Redis cache; falls back to DB metadata if cold.
   */
  static async getAccountResult(
    accountId: number,
  ): Promise<AccountReconciliationResult & { cacheStatus: "hot" | "cold" }> {
    const cached = await redis.get(ACCOUNT_KEY(accountId));

    if (cached) {
      return { ...(JSON.parse(cached) as AccountReconciliationResult), cacheStatus: "hot" };
    }

    // Cache miss — fetch live DB metadata
    const account = await prisma.ledgerAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        companyId: true,
        balance: true,
        lastReconciledAt: true,
      },
    });

    if (!account) {
      throw new NotFoundError(
        `Ledger account with id=${accountId} not found`,
      );
    }

    return {
      accountId: Number(account.id),
      accountName: account.name,
      companyId: account.companyId,
      storedBalance: account.balance.toString(),
      computedBalance: "unchecked",
      discrepancy: false,
      corrected: false,
      reconciledAt: account.lastReconciledAt?.toISOString() ?? "never",
      cacheStatus: "cold",
    };
  }

  /**
   * Purges all reconciliation cache keys from Redis.
   * Useful when a manual re-run is about to be triggered so the
   * dashboard doesn't show stale data.
   */
  static async invalidateCache(): Promise<{ keysDeleted: number }> {
    const stream = redis.scanStream({
      match: "ledger:reconciliation:*",
      count: 100,
    });

    const keys: string[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (batch: string[]) => keys.push(...batch));
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    if (keys.length) {
      await redis.del(...keys);
    }

    return { keysDeleted: keys.length };
  }
}
