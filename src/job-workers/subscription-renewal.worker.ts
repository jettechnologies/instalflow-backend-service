import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";
import { SubscriptionRenewalWorker } from "@/shared/job-workers/subscription-renewal.worker";

export const subscriptionRenewalBullWorker = new Worker(
  QueueNames.SubscriptionRenewalQueue,
  async (job) => {
    console.log(
      `📥 [SubscriptionRenewal] Processing job ${job.id ?? "manual"}`,
    );
    await SubscriptionRenewalWorker.run();
    return { success: true, timestamp: new Date().toISOString() };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

subscriptionRenewalBullWorker.on("completed", (job) => {
  console.log(`✅ [SubscriptionRenewal] Job ${job.id} completed.`);
});

subscriptionRenewalBullWorker.on("failed", (job, err) => {
  console.error(`❌ [SubscriptionRenewal] Job ${job?.id} failed:`, err.message);
});
