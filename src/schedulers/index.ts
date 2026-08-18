import "dotenv/config";
import "@/infrastructure/config/validate-env";
import "@/infrastructure/logger/instruments";

import "@/schedulers/kyc-retention.scheduler";
import "@/schedulers/onboarding-sweeper.scheduler";
import "@/schedulers/installment-payment-reminder.scheduler";
import "@/schedulers/ledger-reconciliation.scheduler";
import "@/schedulers/payment-recovery.scheduler";
import "@/schedulers/merchant-settlement-generation.scheduler";
import "@/schedulers/subscription-renewal.scheduler";

console.log("✅ Schedulers initialized");
