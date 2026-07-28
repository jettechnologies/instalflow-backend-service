/*
  Warnings:

  - The `status` column on the `KycApplication` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "KycApplicationStatus" AS ENUM ('PENDING', 'APPROVAL_PROCESSING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "KycApplication" DROP COLUMN "status",
ADD COLUMN     "status" "KycApplicationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "KycApplication_status_created_at_idx" ON "KycApplication"("status", "created_at");
