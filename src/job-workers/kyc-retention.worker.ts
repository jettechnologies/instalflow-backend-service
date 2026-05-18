import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";
import { KycRetentionWorker } from "@/shared/job-workers/kyc-retention.worker";

export const kycRetentionWorker = new Worker(
  QueueNames.KycRetentionQueue,
  async (job) => {
    console.log(
      `📥 [KycRetentionWorker] Processing cleanup job ${job.id || "manual"}`,
    );
    await KycRetentionWorker.runCleanup();
    return { success: true, timestamp: new Date() };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

kycRetentionWorker.on("completed", (job) => {
  console.log(`✅ [KycRetentionWorker] Job completed: ${job.id}`);
});

kycRetentionWorker.on("failed", (job, err) => {
  console.error(
    `❌ [KycRetentionWorker] Job failed: ${job?.id}. Error:`,
    err.message,
  );
});
