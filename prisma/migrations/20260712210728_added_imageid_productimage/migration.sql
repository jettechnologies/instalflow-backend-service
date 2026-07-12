/*
  Warnings:

  - A unique constraint covering the columns `[imageId]` on the table `ProductImage` will be added. If there are existing duplicate values, this will fail.
  - The required column `imageId` was added to the `ProductImage` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "PaymentIntent" ALTER COLUMN "intentId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "imageId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_imageId_key" ON "ProductImage"("imageId");

-- RenameIndex
ALTER INDEX "PaymentIntent_reservationKey_idx" RENAME TO "PaymentIntent_reservation_key_idx";
