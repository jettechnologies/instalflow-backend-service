/*
  Warnings:

  - You are about to drop the column `maxPrice` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `minPrice` on the `Product` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "maxPrice",
DROP COLUMN "minPrice",
ADD COLUMN     "max_price" DECIMAL(65,30),
ADD COLUMN     "min_price" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "ProductInstallmentPlan" (
    "id" BIGSERIAL NOT NULL,
    "planId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "interestPercentage" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductInstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductInstallmentPlan_planId_key" ON "ProductInstallmentPlan"("planId");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstallmentPlan" ADD CONSTRAINT "ProductInstallmentPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE CASCADE ON UPDATE CASCADE;
