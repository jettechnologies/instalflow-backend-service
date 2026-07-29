import { QueueNames } from "@/infrastructure/redis/constant";
import { registerRepeatableJob } from "./register-repeatable-job";

registerRepeatableJob({
  queueName: QueueNames.InstallmentPaymentReminderQueue,
  jobName: "payment-reminder-scan",
  backoff: {
    type: "exponential",
    delay: 60_000,
  },
  data: {},
  repeat: {
    pattern: "0 0 * * *",
  },
});
