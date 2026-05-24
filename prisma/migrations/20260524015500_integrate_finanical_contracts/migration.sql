/*
  Warnings:

  - You are about to drop the column `productId` on the `Installment` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Installment` table. All the data in the column will be lost.
  - You are about to drop the column `gatewayRef` on the `Payment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[financingContractId,sequence]` on the table `Installment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[providerReference]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `financingContractId` to the `Installment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sequence` to the `Installment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FinancingStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED', 'REJECTED', 'RESTRUCTURED', 'WRITTEN_OFF');

-- DropForeignKey
ALTER TABLE "Installment" DROP CONSTRAINT "Installment_productId_fkey";

-- DropForeignKey
ALTER TABLE "Installment" DROP CONSTRAINT "Installment_userId_fkey";

-- DropIndex
DROP INDEX "Payment_gatewayRef_key";

-- AlterTable
ALTER TABLE "Installment" DROP COLUMN "productId",
DROP COLUMN "userId",
ADD COLUMN     "financingContractId" TEXT NOT NULL,
ADD COLUMN     "overdue_at" TIMESTAMP(3),
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "sequence" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "gatewayRef",
ADD COLUMN     "providerReference" TEXT;

-- CreateTable
CREATE TABLE "FinancingContract" (
    "id" BIGSERIAL NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "kycApplicationId" TEXT NOT NULL,
    "approvedProductPrice" DECIMAL(65,30) NOT NULL,
    "approvedInterestPercentage" DECIMAL(65,30) NOT NULL,
    "approvedDurationMonths" INTEGER NOT NULL,
    "principal" DECIMAL(65,30) NOT NULL,
    "interest" DECIMAL(65,30) NOT NULL,
    "totalFinanced" DECIMAL(65,30) NOT NULL,
    "status" "FinancingStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "defaultedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancingContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancingContract_contractId_key" ON "FinancingContract"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancingContract_kycApplicationId_key" ON "FinancingContract"("kycApplicationId");

-- CreateIndex
CREATE INDEX "FinancingContract_userId_productId_idx" ON "FinancingContract"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_financingContractId_sequence_key" ON "Installment"("financingContractId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerReference_key" ON "Payment"("providerReference");

-- AddForeignKey
ALTER TABLE "FinancingContract" ADD CONSTRAINT "FinancingContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingContract" ADD CONSTRAINT "FinancingContract_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingContract" ADD CONSTRAINT "FinancingContract_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("variantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingContract" ADD CONSTRAINT "FinancingContract_kycApplicationId_fkey" FOREIGN KEY ("kycApplicationId") REFERENCES "KycApplication"("kyc_application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_financingContractId_fkey" FOREIGN KEY ("financingContractId") REFERENCES "FinancingContract"("contractId") ON DELETE RESTRICT ON UPDATE CASCADE;
