// src/infrastructure/queues/onboarding.queue.ts
import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export const onboardingQueue = new Queue(QueueNames.OnboardingQueue, {
  connection: redis,
});
