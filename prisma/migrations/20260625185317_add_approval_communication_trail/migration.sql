-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InternalNotificationType" ADD VALUE 'MARKETER_TOGGLE_REQUEST';
ALTER TYPE "InternalNotificationType" ADD VALUE 'MARKETER_DELETE_REQUEST';
ALTER TYPE "InternalNotificationType" ADD VALUE 'MARKETER_TOGGLE_APPROVED';
ALTER TYPE "InternalNotificationType" ADD VALUE 'MARKETER_TOGGLE_REJECTED';
ALTER TYPE "InternalNotificationType" ADD VALUE 'MARKETER_DELETE_APPROVED';
ALTER TYPE "InternalNotificationType" ADD VALUE 'MARKETER_DELETE_REJECTED';

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);
