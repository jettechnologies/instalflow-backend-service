-- CreateTable PaymentIntent (pre-20260705000000 state)
-- The PaymentIntent table, its enums and indexes were never created by any
-- prior migration, which is why 20260705000000 (ALTER TABLE "PaymentIntent")
-- fails with "relation "PaymentIntent" does not exist".
-- This migration establishes the table WITHOUT the `reservation_key` column
-- and WITHOUT the PROCESSING enum value — both are introduced by the
-- 20260705000000 / 20260705000001 migrations that follow.

-- uuid_generate_v4() is required by @default(uuid()) and may be missing on a
-- fresh shadow database; ensure the extension exists (no-op if already present).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "PaymentIntentType" AS ENUM ('INSTALLMENT', 'ONBOARDING', 'SUBSCRIPTION');

-- CreateEnum
-- NOTE: PROCESSING is intentionally absent here; it is added by
-- 20260705000000_payment_intent_reservation_key.
CREATE TYPE "PaymentInitStatus" AS ENUM ('INITIALIZING', 'INITIALIZED', 'PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" BIGSERIAL NOT NULL,
    "intentId" TEXT NOT NULL DEFAULT uuid_generate_v4(),
    "type" "PaymentIntentType" NOT NULL,
    "reference" TEXT,
    "authorizationUrl" TEXT,
    "status" "PaymentInitStatus" NOT NULL DEFAULT 'INITIALIZING',
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "customerId" TEXT,
    "companyId" TEXT,
    "installmentId" TEXT,
    "onboardingId" TEXT,
    "subscriptionId" TEXT,
    "planId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_intentId_key" ON "PaymentIntent"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_reference_key" ON "PaymentIntent"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_idempotencyKey_key" ON "PaymentIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentIntent_reference_idx" ON "PaymentIntent"("reference");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_expiresAt_idx" ON "PaymentIntent"("status","expiresAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_customerId_status_idx" ON "PaymentIntent"("customerId","status");

-- CreateIndex
CREATE INDEX "PaymentIntent_companyId_status_idx" ON "PaymentIntent"("companyId","status");

-- CreateIndex
CREATE INDEX "PaymentIntent_installmentId_status_idx" ON "PaymentIntent"("installmentId","status");

-- CreateIndex
CREATE INDEX "PaymentIntent_planId_type_idx" ON "PaymentIntent"("planId","type");
