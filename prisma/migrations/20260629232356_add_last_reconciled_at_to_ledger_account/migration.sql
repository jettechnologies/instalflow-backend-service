/*
  Warnings:

  - The values [FROZEN] on the enum `CommissionStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[paymentId]` on the table `Commission` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[paymentId,commissionId]` on the table `Commission` will be added. If there are existing duplicate values, this will fail.
  - Made the column `paymentId` on table `Commission` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CommissionStatus_new" AS ENUM ('ACTIVE', 'PARTIALLY_RESERVED', 'RESERVED', 'PAID');
ALTER TABLE "public"."Commission" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Commission" ALTER COLUMN "status" TYPE "CommissionStatus_new" USING ("status"::text::"CommissionStatus_new");
ALTER TYPE "CommissionStatus" RENAME TO "CommissionStatus_old";
ALTER TYPE "CommissionStatus_new" RENAME TO "CommissionStatus";
DROP TYPE "public"."CommissionStatus_old";
ALTER TABLE "Commission" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- DropForeignKey
ALTER TABLE "Commission" DROP CONSTRAINT "Commission_paymentId_fkey";

-- AlterTable
ALTER TABLE "Commission" ALTER COLUMN "paymentId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LedgerAccount" ADD COLUMN     "last_reconciled_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Commission_paymentId_key" ON "Commission"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_paymentId_commissionId_key" ON "Commission"("paymentId", "commissionId");

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("paymentId") ON DELETE RESTRICT ON UPDATE CASCADE;
