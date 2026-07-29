import { QueueNames } from "@/infrastructure/redis/constant";
import { registerRepeatableJob } from "./register-repeatable-job";

registerRepeatableJob({
  queueName: QueueNames.LedgerReconciliationQueue,
  jobName: "ledger-reconciliation-scan",
  data: {},
  backoff: {
    type: "exponential",
    delay: 60_000,
  },
  repeat: {
    pattern: "0 2 * * *",
  },
});
