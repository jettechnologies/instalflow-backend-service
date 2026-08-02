-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "initializationPayload" JSONB,
ADD COLUMN     "lastRecoveryError" TEXT,
ADD COLUMN     "recoveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recoveryClaimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PaymentIntent_status_recoveryClaimedAt_idx" ON "PaymentIntent"("status", "recoveryClaimedAt");
