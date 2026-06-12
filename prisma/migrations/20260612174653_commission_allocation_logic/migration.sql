/*
  Warnings:

  - The values [PENDING,APPROVED] on the enum `CommissionStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "CommissionAllocationStatus" AS ENUM ('RESERVED', 'PAID', 'RELEASED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommissionPayoutStatus" ADD VALUE 'TRANSFER_INITIATED';
ALTER TYPE "CommissionPayoutStatus" ADD VALUE 'TRANSFER_FAILED';
ALTER TYPE "CommissionPayoutStatus" ADD VALUE 'TRANSFER_REVERSED';

-- AlterEnum
BEGIN;
CREATE TYPE "CommissionStatus_new" AS ENUM ('ACTIVE', 'PARTIALLY_RESERVED', 'RESERVED', 'PAID', 'FROZEN');
ALTER TABLE "public"."Commission" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Commission" ALTER COLUMN "status" TYPE "CommissionStatus_new" USING ("status"::text::"CommissionStatus_new");
ALTER TYPE "CommissionStatus" RENAME TO "CommissionStatus_old";
ALTER TYPE "CommissionStatus_new" RENAME TO "CommissionStatus";
DROP TYPE "public"."CommissionStatus_old";
ALTER TABLE "Commission" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InternalNotificationType" ADD VALUE 'COMMISSION_REQUEST_APPROVAL';
ALTER TYPE "InternalNotificationType" ADD VALUE 'COMMISSION_TRANSFER_INITIATED';
ALTER TYPE "InternalNotificationType" ADD VALUE 'COMMISSION_TRANSFER_SUCCESS';
ALTER TYPE "InternalNotificationType" ADD VALUE 'COMMISSION_TRANSFER_FAILED';
ALTER TYPE "InternalNotificationType" ADD VALUE 'COMMISSION_TRANSFER_REVERSED';

-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "reserved_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "CommissionPayoutRequest" ADD COLUMN     "marketerBankAccountId" BIGINT,
ADD COLUMN     "transferCode" TEXT,
ADD COLUMN     "transfer_completed_at" TIMESTAMP(3),
ADD COLUMN     "transfer_fail_reason" TEXT,
ADD COLUMN     "transfer_failed_at" TIMESTAMP(3),
ADD COLUMN     "transfer_initiated_at" TIMESTAMP(3),
ADD COLUMN     "transfer_initiated_by_id" TEXT;

-- CreateTable
CREATE TABLE "CommissionAllocation" (
    "id" BIGSERIAL NOT NULL,
    "allocationId" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "allocated_amount" DECIMAL(65,30) NOT NULL,
    "status" "CommissionAllocationStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketerBankAccount" (
    "id" BIGSERIAL NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "recipient_code" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketerBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionAllocation_allocationId_key" ON "CommissionAllocation"("allocationId");

-- CreateIndex
CREATE INDEX "CommissionAllocation_commissionId_status_idx" ON "CommissionAllocation"("commissionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionAllocation_payoutId_commissionId_key" ON "CommissionAllocation"("payoutId", "commissionId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketerBankAccount_account_id_key" ON "MarketerBankAccount"("account_id");

-- CreateIndex
CREATE INDEX "MarketerBankAccount_user_id_idx" ON "MarketerBankAccount"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketerBankAccount_user_id_account_number_key" ON "MarketerBankAccount"("user_id", "account_number");

-- AddForeignKey
ALTER TABLE "CommissionAllocation" ADD CONSTRAINT "CommissionAllocation_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "CommissionPayoutRequest"("payoutId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAllocation" ADD CONSTRAINT "CommissionAllocation_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("commissionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutRequest" ADD CONSTRAINT "CommissionPayoutRequest_marketerBankAccountId_fkey" FOREIGN KEY ("marketerBankAccountId") REFERENCES "MarketerBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutRequest" ADD CONSTRAINT "CommissionPayoutRequest_transfer_initiated_by_id_fkey" FOREIGN KEY ("transfer_initiated_by_id") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketerBankAccount" ADD CONSTRAINT "MarketerBankAccount_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
