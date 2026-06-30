-- AlterEnum
ALTER TYPE "InstallmentStatus" ADD VALUE 'VOIDED';

-- AlterTable
ALTER TABLE "FinancingContract" ADD COLUMN     "restructuredAt" TIMESTAMP(3),
ADD COLUMN     "restructuredById" TEXT,
ADD COLUMN     "writeOffReason" TEXT,
ADD COLUMN     "writtenOffAt" TIMESTAMP(3),
ADD COLUMN     "writtenOffById" TEXT;
