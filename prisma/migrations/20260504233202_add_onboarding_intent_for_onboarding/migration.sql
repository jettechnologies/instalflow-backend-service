/*
  Warnings:

  - You are about to drop the `PendingOnboarding` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING', 'PAYMENT_INITIALIZED', 'PAID', 'COMPLETED', 'FAILED');

-- DropTable
DROP TABLE "PendingOnboarding";

-- CreateTable
CREATE TABLE "OnboardingIntent" (
    "id" BIGSERIAL NOT NULL,
    "intentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "paymentReference" TEXT,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingIntent_intentId_key" ON "OnboardingIntent"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingIntent_email_key" ON "OnboardingIntent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingIntent_paymentReference_key" ON "OnboardingIntent"("paymentReference");

-- CreateIndex
CREATE INDEX "OnboardingIntent_paymentReference_idx" ON "OnboardingIntent"("paymentReference");

-- AddForeignKey
ALTER TABLE "OnboardingIntent" ADD CONSTRAINT "OnboardingIntent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("planId") ON DELETE RESTRICT ON UPDATE CASCADE;
