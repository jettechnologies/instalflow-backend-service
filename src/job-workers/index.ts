// src/job-workers/index.ts — Worker Runtime Entrypoint
// This process runs BullMQ consumers ONLY. No Express server.

import "dotenv/config";
import "@/infrastructure/logger/instruments";
import "@/job-workers/onboarding.worker";

console.log("✅ BullMQ Workers initialized");
