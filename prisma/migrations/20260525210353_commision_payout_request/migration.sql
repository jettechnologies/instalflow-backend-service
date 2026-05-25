-- CreateEnum
CREATE TYPE "CommissionPayoutStatus" AS ENUM ('PENDING_ADMIN_APPROVAL', 'PENDING_COMPANY_APPROVAL', 'APPROVED', 'REJECTED', 'PAID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InternalNotificationType" ADD VALUE 'INSTALLMENT_REMINDER_3DAY';
ALTER TYPE "InternalNotificationType" ADD VALUE 'INSTALLMENT_DUE_TODAY';
ALTER TYPE "InternalNotificationType" ADD VALUE 'INSTALLMENT_OVERDUE_3DAY';
ALTER TYPE "InternalNotificationType" ADD VALUE 'INSTALLMENT_OVERDUE_7DAY';

-- CreateTable
CREATE TABLE "CommissionPayoutRequest" (
    "id" BIGSERIAL NOT NULL,
    "payoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "CommissionPayoutStatus" NOT NULL DEFAULT 'PENDING_ADMIN_APPROVAL',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminApprovedById" TEXT,
    "adminApprovedAt" TIMESTAMP(3),
    "companyApprovedById" TEXT,
    "companyApprovedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayoutRequest_payoutId_key" ON "CommissionPayoutRequest"("payoutId");

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("paymentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutRequest" ADD CONSTRAINT "CommissionPayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutRequest" ADD CONSTRAINT "CommissionPayoutRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutRequest" ADD CONSTRAINT "CommissionPayoutRequest_adminApprovedById_fkey" FOREIGN KEY ("adminApprovedById") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutRequest" ADD CONSTRAINT "CommissionPayoutRequest_companyApprovedById_fkey" FOREIGN KEY ("companyApprovedById") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
