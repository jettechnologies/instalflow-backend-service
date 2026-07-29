import { QueueNames } from "@/infrastructure/redis/constant";
import { registerRepeatableJob } from "./register-repeatable-job";

registerRepeatableJob({
  queueName: QueueNames.PaymentRecoveryQueue,
  jobName: "payment-recovery-cron",
  data: {},
  repeat: {
    pattern: "*/1 * * * *",
  },
});
