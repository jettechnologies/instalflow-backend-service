// src/queue/onboarding.queue.ts
import { Queue } from "bullmq";
import { redis } from "@/config/redis-config/redis-connect";
import { QueueNames } from "@/config/redis-config/constant";

export const onboardingQueue = new Queue(QueueNames.OnboardingQueue, {
  connection: redis,
});
