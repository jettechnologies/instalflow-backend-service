/*
  Warnings:

  - You are about to drop the column `last_reconciled_at` on the `LedgerAccount` table. All the data in the column will be lost.
  - Added the required column `lastReconciledAt` to the `LedgerAccount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "CommissionStatus" ADD VALUE 'FROZEN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InternalNotificationType" ADD VALUE 'CONTRACT_WRITTEN_OFF';
ALTER TYPE "InternalNotificationType" ADD VALUE 'CONTRACT_RESTRUCTURED';

-- DropForeignKey
ALTER TABLE "Commission" DROP CONSTRAINT "Commission_paymentId_fkey";

-- DropIndex
DROP INDEX "Commission_paymentId_commissionId_key";

-- DropIndex
DROP INDEX "Commission_paymentId_key";

-- AlterTable
ALTER TABLE "Commission" ALTER COLUMN "paymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LedgerAccount" DROP COLUMN "last_reconciled_at",
ADD COLUMN     "lastReconciledAt" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("paymentId") ON DELETE SET NULL ON UPDATE CASCADE;
