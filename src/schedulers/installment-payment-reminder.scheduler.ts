import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export const paymentReminderQueue = new Queue(
  QueueNames.InstallmentPaymentReminderQueue,
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

paymentReminderQueue
  .add(
    "payment-reminder-scan",
    {},
    {
      repeat: {
        pattern: "0/10 * * * *",
      },
    },
  )
  .then(() => {
    console.log(
      "⏰ [PaymentReminderQueue] Repeatable reminder scan job registered (daily at 00:00).",
    );
  })
  .catch((err) => {
    console.error(
      "❌ [PaymentReminderQueue] Failed to register cron job:",
      err.message,
    );
  });
