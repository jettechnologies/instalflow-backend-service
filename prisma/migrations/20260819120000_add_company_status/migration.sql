-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT,
ADD COLUMN     "suspendedById" TEXT;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
