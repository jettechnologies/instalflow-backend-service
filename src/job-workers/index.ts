// src/job-workers/index.ts — Worker Runtime Entrypoint
// This process runs BullMQ consumers ONLY. No Express server.

import "dotenv/config";
import "@/infrastructure/logger/instruments";
import "@/job-workers/onboarding.worker";
import "@/job-workers/kyc-retention.worker";
import "@/job-workers/payment.worker";

console.log("✅ BullMQ Workers initialized");
