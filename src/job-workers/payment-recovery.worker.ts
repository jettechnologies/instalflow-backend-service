import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";
import { PaymentRecoveryWorker } from "@/shared/job-workers/payment-recovery.worker";

export const paymentRecoveryWorker = new Worker(
  QueueNames.PaymentRecoveryQueue,
  async (job) => {
    console.log(
      `📥 [PaymentRecoveryWorker] Processing recovery job ${job.id || "manual"}`,
    );
    await PaymentRecoveryWorker.runRecovery();
    return { success: true, timestamp: new Date() };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

paymentRecoveryWorker.on("completed", (job) => {
  console.log(`✅ [PaymentRecoveryWorker] Job completed: ${job.id}`);
});

paymentRecoveryWorker.on("failed", (job, err) => {
  console.error(
    `❌ [PaymentRecoveryWorker] Job failed: ${job?.id}. Error:`,
    err.message,
  );
});
