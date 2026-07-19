// src/schedulers/ledger-reconciliation.scheduler.ts
// Registers a repeatable BullMQ job that triggers ledger reconciliation daily at 02:00.
// The actual reconciliation logic lives in the corresponding worker.

import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export const ledgerReconciliationQueue = new Queue(
  QueueNames.LedgerReconciliationQueue,
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 60_000,
      },
    },
  },
);

ledgerReconciliationQueue
  .add(
    "ledger-reconciliation-scan",
    {},
    {
      repeat: {
        pattern: "0 2 * * *",
      },
    },
  )
  .then(() => {
    console.log(
      "⏰ [LedgerReconciliationQueue] Repeatable reconciliation job registered (daily at 02:00).",
    );
  })
  .catch((err: Error) => {
    console.error(
      "❌ [LedgerReconciliationQueue] Failed to register cron job:",
      err.message,
    );
  });
