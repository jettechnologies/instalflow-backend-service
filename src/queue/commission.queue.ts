// src/queue/commission.queue.ts
import { Queue } from "bullmq";
import { redis } from "@/config/redis-config/redis-connect";
import { QueueNames } from "@/config/redis-config/constant";

export const commissionQueue = new Queue(QueueNames.CommissionQueue, {
  connection: redis,
});
