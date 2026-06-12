import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export interface TransferJobData {
  payoutId: string;
  initiatedByUserId: string;
}

export const transferQueue = new Queue<TransferJobData>(
  QueueNames.TransferQueue,
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  },
);
