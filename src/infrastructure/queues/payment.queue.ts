// src/infrastructure/queues/payment.queue.ts
import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export const paymentQueue = new Queue(QueueNames.PaymentQueue, {
  connection: redis,
});
