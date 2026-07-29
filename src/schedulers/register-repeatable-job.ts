import { BackoffOptions, Queue, type DefaultJobOptions } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";

type RepeatOptions = {
  pattern?: string;
  every?: number;
};

type RegisterRepeatableJobParams = {
  queueName: string;
  jobName: string;
  backoff?: BackoffOptions;
  data: any;
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
      // backoff: {
      //   type: "exponential",
      //   delay: 5000,
      // },
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
  } catch (err: any) {
    console.error(
      `❌ [Scheduler] Failed to register "${jobName}":`,
      err.message,
    );
  } finally {
    await queue.close();
  }
}
