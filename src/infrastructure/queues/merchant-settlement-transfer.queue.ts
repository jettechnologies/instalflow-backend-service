import { Queue } from "bullmq";
import { redis } from "@/infrastructure/redis/redis-connect";
import { QueueNames } from "@/infrastructure/redis/constant";

export interface MerchantSettlementTransferJobData {
  settlementId: string;
}

export const merchantSettlementTransferQueue =
  new Queue<MerchantSettlementTransferJobData>(
    QueueNames.MerchantSettlementTransferQueue,
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
