import { Worker } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";
import { OnboardingSweeperWorker } from "@/shared/job-workers/onboarding-sweeper.worker";

export const onboardingSweeperWorker = new Worker(
  QueueNames.OnboardingSweeperQueue,
  async (job) => {
    console.log(
      `📥 [OnboardingSweeperWorker] Processing sweep job ${job.id || "manual"}`,
    );
    const { drained } = await OnboardingSweeperWorker.run();
    return { success: true, drained, timestamp: new Date() };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

onboardingSweeperWorker.on("completed", (job) => {
  console.log(`✅ [OnboardingSweeperWorker] Job completed: ${job.id}`);
});

onboardingSweeperWorker.on("failed", (job, err) => {
  console.error(
    `❌ [OnboardingSweeperWorker] Job failed: ${job?.id}. Error:`,
    err?.message,
  );
});
