import { QueueNames } from "@/infrastructure/redis/constant";
import { registerRepeatableJob } from "./register-repeatable-job";

registerRepeatableJob({
  queueName: QueueNames.MerchantSettlementGenerationQueue,
  jobName: "merchant-settlement-generation-scan",
  backoff: {
    type: "exponential",
    delay: 60_000,
  },
  data: {},
  repeat: {
    pattern: "0 6 * * 1", // weekly, Monday 06:00
  },
});
