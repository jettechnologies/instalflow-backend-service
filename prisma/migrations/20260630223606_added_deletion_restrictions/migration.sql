/*
  Warnings:

  - You are about to drop the column `is_active` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stockQuantity` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stockQuantity` on the `ProductVariant` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SOLD_OUT', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "FinancingContract" DROP CONSTRAINT "FinancingContract_variantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductInstallmentPlan" DROP CONSTRAINT "ProductInstallmentPlan_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "is_active",
DROP COLUMN "stockQuantity",
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "stock_quantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductVariant" DROP COLUMN "stockQuantity",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stock_quantity" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "FinancingContract_variantId_idx" ON "FinancingContract"("variantId");

-- CreateIndex
CREATE INDEX "FinancingContract_status_idx" ON "FinancingContract"("status");

-- CreateIndex
CREATE INDEX "KycApplication_user_id_idx" ON "KycApplication"("user_id");

-- CreateIndex
CREATE INDEX "KycApplication_product_id_idx" ON "KycApplication"("product_id");

-- CreateIndex
CREATE INDEX "KycApplication_variant_id_idx" ON "KycApplication"("variant_id");

-- CreateIndex
CREATE INDEX "KycApplication_installment_plan_id_idx" ON "KycApplication"("installment_plan_id");

-- CreateIndex
CREATE INDEX "KycApplication_status_idx" ON "KycApplication"("status");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");

-- CreateIndex
CREATE INDEX "ProductInstallmentPlan_productId_idx" ON "ProductInstallmentPlan"("productId");

-- CreateIndex
CREATE INDEX "ProductInstallmentPlan_active_idx" ON "ProductInstallmentPlan"("active");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_stock_quantity_idx" ON "ProductVariant"("stock_quantity");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingContract" ADD CONSTRAINT "FinancingContract_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("variantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstallmentPlan" ADD CONSTRAINT "ProductInstallmentPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE;
