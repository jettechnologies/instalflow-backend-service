/*
  Warnings:

  - A unique constraint covering the columns `[publicSignupCode]` on the table `Company` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MerchantSettlementStatus" AS ENUM ('GENERATED', 'APPROVED', 'TRANSFER_INITIATED', 'TRANSFER_SUCCESS', 'TRANSFER_FAILED', 'TRANSFER_REVERSED');

-- CreateEnum
CREATE TYPE "SettlementAuditActor" AS ENUM ('SYSTEM', 'SCHEDULER', 'WORKER', 'WEBHOOK', 'USER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionStatus" ADD VALUE 'GRACE_PERIOD';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'RESTRICTED';

-- DropForeignKey
ALTER TABLE "OnboardingSession" DROP CONSTRAINT "OnboardingSession_marketerId_fkey";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "publicSignupCode" TEXT;

-- AlterTable
ALTER TABLE "OnboardingSession" ALTER COLUMN "marketerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "gracePeriodDays" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "CompanyBankAccount" (
    "id" BIGSERIAL NOT NULL,
    "account_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "recipient_code" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantSettlementRequest" (
    "id" BIGSERIAL NOT NULL,
    "settlementId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "MerchantSettlementStatus" NOT NULL DEFAULT 'GENERATED',
    "transferCode" TEXT,
    "companyBankAccountId" BIGINT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "transferQueuedAt" TIMESTAMP(3),
    "transferInitiatedAt" TIMESTAMP(3),
    "transferCodeReceivedAt" TIMESTAMP(3),
    "webhookReceivedAt" TIMESTAMP(3),
    "transferCompletedAt" TIMESTAMP(3),
    "transferFailedAt" TIMESTAMP(3),
    "transferFailReason" TEXT,
    "lastRetryAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "retryInitiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantSettlementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantSettlementLine" (
    "id" BIGSERIAL NOT NULL,
    "lineId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "commissionDeducted" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantSettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantSettlementAuditTrail" (
    "id" BIGSERIAL NOT NULL,
    "auditId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" "SettlementAuditActor" NOT NULL,
    "performedById" TEXT,
    "outcome" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantSettlementAuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBankAccount_account_id_key" ON "CompanyBankAccount"("account_id");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_company_id_idx" ON "CompanyBankAccount"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBankAccount_company_id_account_number_key" ON "CompanyBankAccount"("company_id", "account_number");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSettlementRequest_settlementId_key" ON "MerchantSettlementRequest"("settlementId");

-- CreateIndex
CREATE INDEX "MerchantSettlementRequest_companyId_status_idx" ON "MerchantSettlementRequest"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSettlementLine_lineId_key" ON "MerchantSettlementLine"("lineId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSettlementLine_installmentId_key" ON "MerchantSettlementLine"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSettlementAuditTrail_auditId_key" ON "MerchantSettlementAuditTrail"("auditId");

-- CreateIndex
CREATE INDEX "MerchantSettlementAuditTrail_settlementId_createdAt_idx" ON "MerchantSettlementAuditTrail"("settlementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_publicSignupCode_key" ON "Company"("publicSignupCode");

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_marketerId_fkey" FOREIGN KEY ("marketerId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBankAccount" ADD CONSTRAINT "CompanyBankAccount_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlementRequest" ADD CONSTRAINT "MerchantSettlementRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlementRequest" ADD CONSTRAINT "MerchantSettlementRequest_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlementRequest" ADD CONSTRAINT "MerchantSettlementRequest_retryInitiatedById_fkey" FOREIGN KEY ("retryInitiatedById") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlementLine" ADD CONSTRAINT "MerchantSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "MerchantSettlementRequest"("settlementId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlementLine" ADD CONSTRAINT "MerchantSettlementLine_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("installmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlementAuditTrail" ADD CONSTRAINT "MerchantSettlementAuditTrail_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "MerchantSettlementRequest"("settlementId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlementAuditTrail" ADD CONSTRAINT "MerchantSettlementAuditTrail_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
