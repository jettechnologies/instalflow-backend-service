import "dotenv/config";
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

console.log("✅ BullMQ Workers initialized");
