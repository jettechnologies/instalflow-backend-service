/*
  Warnings:

  - You are about to drop the column `webhookPayload` on the `Payment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FinancingContract" ADD COLUMN     "rejectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "webhookPayload";
