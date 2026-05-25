import "dotenv/config";
import "@/infrastructure/logger/instruments";

import "@/schedulers/kyc-retention.scheduler";
import "@/schedulers/installment-payment-reminder.scheduler";

console.log("✅ Schedulers initialized");
