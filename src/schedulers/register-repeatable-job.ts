import type { BackoffOptions } from "bullmq";
import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";

type RepeatOptions = {
  pattern?: string;
  every?: number;
};

type RegisterRepeatableJobParams = {
  queueName: string;
  jobName: string;
  backoff?: BackoffOptions;
  data: unknown;
  repeat: RepeatOptions;
};

export async function registerRepeatableJob({
  queueName,
  jobName,
  backoff = {
    type: "exponential",
    delay: 5000,
  },
  data,
  repeat,
}: RegisterRepeatableJobParams): Promise<void> {
  const queue = new Queue(queueName, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff,
    },
  });

  try {
    const existingJobs = await queue.getRepeatableJobs();

    for (const job of existingJobs) {
      if (job.name === jobName) {
        await queue.removeRepeatableByKey(job.key);
      }
    }

    await queue.add(jobName, data, { repeat });
    console.log(
      `✅ [Scheduler] Registered repeatable job "${jobName}" on queue "${queueName}"`,
    );
  } catch (err: unknown) {
    console.error(
      `❌ [Scheduler] Failed to register "${jobName}":`,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    await queue.close();
  }
}
