import { QueueNames } from "@/infrastructure/redis/constant";
import { registerRepeatableJob } from "./register-repeatable-job";

registerRepeatableJob({
  queueName: QueueNames.SubscriptionRenewalQueue,
  jobName: "subscription-renewal-scan",
  backoff: {
    type: "exponential",
    delay: 60_000,
  },
  data: {},
  repeat: {
    pattern: "0 3 * * *", // daily 03:00
  },
});
