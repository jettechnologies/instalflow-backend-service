-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InternalNotificationType" ADD VALUE 'KYC_APPLICATION_AUTO_EXPIRED';
ALTER TYPE "InternalNotificationType" ADD VALUE 'ONBOARDING_SESSION_EXPIRED';
ALTER TYPE "InternalNotificationType" ADD VALUE 'INSTALLMENT_REMINDER_1DAY';
ALTER TYPE "InternalNotificationType" ADD VALUE 'INSTALLMENT_OVERDUE_RECURRING';
