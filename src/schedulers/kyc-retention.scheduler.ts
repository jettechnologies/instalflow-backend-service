import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export const kycRetentionQueue = new Queue(QueueNames.KycRetentionQueue, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

kycRetentionQueue
  .add(
    "kyc-cleanup-cron",
    {},
    {
      repeat: {
        pattern: "0 * * * *",
      },
    },
  )
  .then(() => {
    console.log(
      "⏰ [KycRetentionScheduler] Repeatable cleanup cron job successfully registered.",
    );
  })
  .catch((err) => {
    console.error(
      "❌ [KycRetentionScheduler] Failed to register cron job:",
      err.message,
    );
  });
