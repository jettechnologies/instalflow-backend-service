import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export const onboardingSweeperQueue = new Queue(
  QueueNames.OnboardingSweeperQueue,
  {
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
  },
);

onboardingSweeperQueue
  .add(
    "onboarding-sweep-cron",
    {},
    {
      repeat: {
        pattern: "0 0 * * *",
      },
    },
  )
  .then(() => {
    console.log(
      "⏰ [OnboardingSweeperScheduler] Repeatable sweep cron job successfully registered.",
    );
  })
  .catch((err) => {
    console.error(
      "❌ [OnboardingSweeperScheduler] Failed to register cron job:",
      err.message,
    );
  });
