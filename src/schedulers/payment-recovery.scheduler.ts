import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export const paymentRecoveryQueue = new Queue(QueueNames.PaymentRecoveryQueue, {
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

paymentRecoveryQueue
  .add(
    "payment-recovery-cron",
    {},
    {
      repeat: {
        pattern: "*/1 * * * *",
      },
    },
  )
  .then(() => {
    console.log(
      "⏰ [PaymentRecoveryScheduler] Repeatable recovery cron job successfully registered.",
    );
  })
  .catch((err) => {
    console.error(
      "❌ [PaymentRecoveryScheduler] Failed to register cron job:",
      err.message,
    );
  });
