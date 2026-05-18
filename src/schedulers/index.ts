// src/schedulers/index.ts — Scheduler Runtime Entrypoint
// This process runs cron/repeatable BullMQ jobs ONLY.
// Add scheduler imports here as you create them:
//   import "@/schedulers/reminder.scheduler";
//   import "@/schedulers/subscription.scheduler";

import "dotenv/config";
import "@/infrastructure/logger/instruments";

import "@/schedulers/kyc-retention.scheduler";

console.log("✅ Schedulers initialized: KycRetentionScheduler is active");
