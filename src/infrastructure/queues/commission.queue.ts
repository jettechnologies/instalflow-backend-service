// src/infrastructure/queues/commission.queue.ts
import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export const commissionQueue = new Queue(QueueNames.CommissionQueue, {
  connection: redis,
});
