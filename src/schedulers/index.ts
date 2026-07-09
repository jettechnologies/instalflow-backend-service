import "dotenv/config";
import "@/infrastructure/logger/instruments";

import "@/schedulers/kyc-retention.scheduler";
import "@/schedulers/installment-payment-reminder.scheduler";
import "@/schedulers/ledger-reconciliation.scheduler";
import "@/schedulers/payment-recovery.scheduler";

console.log("✅ Schedulers initialized");
