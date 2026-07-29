import { QueueNames } from "@/infrastructure/redis/constant";
import { registerRepeatableJob } from "./register-repeatable-job";

registerRepeatableJob({
  queueName: QueueNames.KycRetentionQueue,
  jobName: "kyc-cleanup-cron",
  data: {},
  repeat: {
    pattern: "0 0 * * *",
  },
});
