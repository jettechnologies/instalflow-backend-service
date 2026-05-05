// src/queue/payment.queue.ts
import { Queue } from "bullmq";
import { redis } from "@/config/redis-config/redis-connect";
import { QueueNames } from "@/config/redis-config/constant";

export const paymentQueue = new Queue(QueueNames.PaymentQueue, {
  connection: redis,
});
