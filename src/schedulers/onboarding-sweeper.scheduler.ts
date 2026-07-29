import { QueueNames } from "@/infrastructure/redis/constant";
import { registerRepeatableJob } from "./register-repeatable-job";

registerRepeatableJob({
  queueName: QueueNames.OnboardingSweeperQueue,
  jobName: "onboarding-sweep-cron",
  data: {},
  repeat: {
    pattern: "0 0 * * *",
  },
});
