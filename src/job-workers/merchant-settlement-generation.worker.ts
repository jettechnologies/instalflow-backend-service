import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";
import { MerchantSettlementGenerationWorker } from "@/shared/job-workers/merchant-settlement-generation.worker";

export const merchantSettlementGenerationBullWorker = new Worker(
  QueueNames.MerchantSettlementGenerationQueue,
  async (job) => {
    console.log(
      `📥 [MerchantSettlementGeneration] Processing job ${job.id ?? "manual"}`,
    );
    await MerchantSettlementGenerationWorker.run();
    return { success: true, timestamp: new Date().toISOString() };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

merchantSettlementGenerationBullWorker.on("completed", (job) => {
  console.log(`✅ [MerchantSettlementGeneration] Job ${job.id} completed.`);
});

merchantSettlementGenerationBullWorker.on("failed", (job, err) => {
  console.error(
    `❌ [MerchantSettlementGeneration] Job ${job?.id} failed:`,
    err.message,
  );
});
