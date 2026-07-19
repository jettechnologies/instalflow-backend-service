/*
  Warnings:

  - A unique constraint covering the columns `[onboarding_session_id]` on the table `KycApplication` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "KycOnboardingStatus" AS ENUM ('PENDING_KYC', 'KYC_SUBMITTED', 'APPROVED', 'EXPIRED', 'EXPIRING', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "FinancingContract" DROP CONSTRAINT "FinancingContract_userId_fkey";

-- DropForeignKey
ALTER TABLE "KycApplication" DROP CONSTRAINT "KycApplication_user_id_fkey";

-- AlterTable
ALTER TABLE "FinancingContract" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "KycApplication" ADD COLUMN     "onboarding_session_id" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" BIGSERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "marketerId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" "KycOnboardingStatus" NOT NULL DEFAULT 'PENDING_KYC',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_sessionId_key" ON "OnboardingSession"("sessionId");

-- CreateIndex
CREATE INDEX "OnboardingSession_email_status_idx" ON "OnboardingSession"("email", "status");

-- CreateIndex
CREATE INDEX "OnboardingSession_status_expiresAt_idx" ON "OnboardingSession"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "KycApplication_onboarding_session_id_key" ON "KycApplication"("onboarding_session_id");

-- CreateIndex
CREATE INDEX "KycApplication_onboarding_session_id_idx" ON "KycApplication"("onboarding_session_id");

-- AddForeignKey
ALTER TABLE "KycApplication" ADD CONSTRAINT "KycApplication_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycApplication" ADD CONSTRAINT "KycApplication_onboarding_session_id_fkey" FOREIGN KEY ("onboarding_session_id") REFERENCES "OnboardingSession"("sessionId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_marketerId_fkey" FOREIGN KEY ("marketerId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("companyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingContract" ADD CONSTRAINT "FinancingContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
