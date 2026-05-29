import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";
import { PaymentReminderWorker } from "@/shared/job-workers/payment-reminder.worker";

export const installmentPaymentReminderBullWorker = new Worker(
  QueueNames.InstallmentPaymentReminderQueue,
  async (job) => {
    console.log(
      `📥 [InstallmentPaymentReminder] Processing job ${job.id ?? "manual"}`,
    );
    await PaymentReminderWorker.run();
    return { success: true, timestamp: new Date().toISOString() };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

installmentPaymentReminderBullWorker.on("completed", (job) => {
  console.log(`✅ [InstallmentPaymentReminder] Job ${job.id} completed.`);
});

installmentPaymentReminderBullWorker.on("failed", (job, err) => {
  console.error(
    `❌ [InstallmentPaymentReminder] Job ${job?.id} failed:`,
    err.message,
  );
});
