/*
  Warnings:

  - You are about to drop the column `is_read` on the `InternalNotification` table. All the data in the column will be lost.
  - You are about to drop the `Application` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `type` to the `InternalNotification` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InternalNotificationType" AS ENUM ('KYC_APPLICATION_SUBMITTED', 'INSTALLMENT_OVERDUE', 'PAYMENT_CONFIRMED', 'COMMISSION_ACCRUED', 'COMMISSION_TRANSFER_REQUEST');

-- CreateEnum
CREATE TYPE "InternalNotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_userId_fkey";

-- AlterTable
ALTER TABLE "InternalNotification" DROP COLUMN "is_read",
ADD COLUMN     "read_at" TIMESTAMP(3),
ADD COLUMN     "status" "InternalNotificationStatus" NOT NULL DEFAULT 'UNREAD',
ADD COLUMN     "type" "InternalNotificationType" NOT NULL;

-- DropTable
DROP TABLE "Application";

-- CreateTable
CREATE TABLE "KycApplication" (
    "id" BIGSERIAL NOT NULL,
    "kyc_application_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "installment_plan_id" TEXT NOT NULL,
    "id_type" TEXT NOT NULL,
    "id_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "marketer_approved" BOOLEAN NOT NULL DEFAULT false,
    "marketer_approved_at" TIMESTAMP(3),
    "admin_approved" BOOLEAN NOT NULL DEFAULT false,
    "admin_approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "is_under_fraud_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocumentAsset" (
    "id" BIGSERIAL NOT NULL,
    "asset_id" TEXT NOT NULL,
    "kyc_application_id" TEXT NOT NULL,
    "cloudinary_public_id" TEXT NOT NULL,
    "secure_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_deletion_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycDocumentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycAuditTrail" (
    "id" BIGSERIAL NOT NULL,
    "audit_id" TEXT NOT NULL,
    "kyc_application_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "performed_by_id" TEXT,
    "outcome" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycAuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KycApplication_kyc_application_id_key" ON "KycApplication"("kyc_application_id");

-- CreateIndex
CREATE UNIQUE INDEX "KycDocumentAsset_asset_id_key" ON "KycDocumentAsset"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "KycAuditTrail_audit_id_key" ON "KycAuditTrail"("audit_id");

-- CreateIndex
CREATE INDEX "InternalNotification_user_id_status_idx" ON "InternalNotification"("user_id", "status");

-- CreateIndex
CREATE INDEX "InternalNotification_user_id_created_at_idx" ON "InternalNotification"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "InternalNotification_type_idx" ON "InternalNotification"("type");

-- AddForeignKey
ALTER TABLE "KycApplication" ADD CONSTRAINT "KycApplication_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocumentAsset" ADD CONSTRAINT "KycDocumentAsset_kyc_application_id_fkey" FOREIGN KEY ("kyc_application_id") REFERENCES "KycApplication"("kyc_application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycAuditTrail" ADD CONSTRAINT "KycAuditTrail_kyc_application_id_fkey" FOREIGN KEY ("kyc_application_id") REFERENCES "KycApplication"("kyc_application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycAuditTrail" ADD CONSTRAINT "KycAuditTrail_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
