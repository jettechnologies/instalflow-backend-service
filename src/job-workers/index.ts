import "dotenv/config";
import "@/infrastructure/config/validate-env";
import "@/infrastructure/logger/instruments";
import "@/core/events/handlers/notification.handler";
import "@/job-workers/onboarding.worker";
import "@/job-workers/kyc-retention.worker";
import "@/job-workers/onboarding-sweeper.worker";
import "@/job-workers/payment.worker";
import "@/job-workers/installment-payment-reminder.worker";
import "@/job-workers/transfer.worker";
import "@/job-workers/ledger-reconciliation.worker";
import "@/job-workers/payment-recovery.worker";
import "@/job-workers/merchant-settlement-transfer.worker";
import "@/job-workers/merchant-settlement-generation.worker";
import "@/job-workers/subscription-renewal.worker";

console.log("✅ BullMQ Workers initialized");
