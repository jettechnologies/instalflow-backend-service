import { prisma } from "@/infrastructure/prisma";
import { KycStorageService } from "@/core/services/kyc-storage.service";

export class KycRetentionWorker {
  /**
   * Enforces the Split Retention Cleanup policies under NDPR / CBN regulations.
   * Executed by Cron job scheduler or plain service scheduler.
   */
  static async runCleanup(): Promise<void> {
    console.log(
      "🧹 [KycRetentionWorker] Starting split retention cleanup sequence...",
    );
    const now = new Date();

    try {
      // 1. Process Physical Asset Deletion for Approved/Rejected/Expired KYC documents
      const assetsToPurge = await prisma.kycDocumentAsset.findMany({
        where: {
          scheduledDeletionAt: { lte: now },
          isDeleted: false,
          kycApplication: {
            legalHold: false,
            isUnderFraudReview: false,
          },
        },
        include: { kycApplication: true },
      });

      console.log(
        `🧹 [KycRetentionWorker] Found ${assetsToPurge.length} transient assets scheduled for purge.`,
      );

      for (const asset of assetsToPurge) {
        try {
          // Explicitly delete file from Cloudinary storage
          await KycStorageService.deleteAsset(asset.cloudinaryPublicId);

          // Update database transient asset record
          await prisma.$transaction(async (tx) => {
            await tx.kycDocumentAsset.update({
              where: { assetId: asset.assetId },
              data: {
                isDeleted: true,
                deletedAt: now,
              },
            });

            // Log permanent immutable Audit Trail entry for evidence collection
            await tx.kycAuditTrail.create({
              data: {
                kycApplicationId: asset.kycApplicationId,
                action: "ASSET_DELETED",
                documentType: "BANK_STATEMENT_PDF",
                fileHash: asset.fileHash,
                outcome: "SUCCESS",
                details:
                  "Physical PDF bank statement purged permanently from active servers under CBN/NDPR separation regulations.",
              },
            });
          });

          console.log(
            `✅ [KycRetentionWorker] Safely purged asset ${asset.assetId} (Cloudinary: ${asset.cloudinaryPublicId}).`,
          );
        } catch (assetErr: any) {
          console.error(
            `❌ [KycRetentionWorker] Failed to purge asset ${asset.assetId}:`,
            assetErr.message,
          );
        }
      }

      // 2. Process Stale Pending Applications: Auto-reject and purge if older than 15 days
      const staleThreshold = new Date();
      staleThreshold.setDate(staleThreshold.getDate() - 15); // 15-day retention grace period

      const staleApplications = await prisma.kycApplication.findMany({
        where: {
          status: "PENDING",
          createdAt: { lte: staleThreshold },
          legalHold: false,
          isUnderFraudReview: false,
        },
        include: { kycDocumentAssets: true },
      });

      console.log(
        `🧹 [KycRetentionWorker] Found ${staleApplications.length} stale pending applications older than 15 days.`,
      );

      for (const app of staleApplications) {
        try {
          const primaryAsset = app.kycDocumentAssets[0];
          const fileHash = primaryAsset ? primaryAsset.fileHash : "mock-hash";

          await prisma.$transaction(async (tx) => {
            await tx.kycApplication.update({
              where: { kycApplicationId: app.kycApplicationId },
              data: {
                status: "REJECTED",
                rejectionReason:
                  "Auto-expired: KYC Application remained pending for more than 15 days without approval.",
              },
            });

            // Write rejection log to permanent Audit Trail
            await tx.kycAuditTrail.create({
              data: {
                kycApplicationId: app.kycApplicationId,
                action: "REJECTED",
                documentType: "BANK_STATEMENT_PDF",
                fileHash: fileHash,
                outcome: "SUCCESS",
                details:
                  "Auto-expired: Pending KYC application stale threshold exceeded (15 days grace period).",
              },
            });

            // Trigger instant document asset cleanup by scheduling in the past
            await tx.kycDocumentAsset.updateMany({
              where: { kycApplicationId: app.kycApplicationId },
              data: { scheduledDeletionAt: new Date(Date.now() - 1000) },
            });
          });

          console.log(
            `✅ [KycRetentionWorker] Stale application ${app.kycApplicationId} auto-expired successfully.`,
          );
        } catch (appErr: any) {
          console.error(
            `❌ [KycRetentionWorker] Failed to auto-expire application ${app.kycApplicationId}:`,
            appErr.message,
          );
        }
      }

      console.log(
        "🧹 [KycRetentionWorker] Split retention cleanup completed successfully.",
      );
    } catch (error: any) {
      console.error(
        "❌ [KycRetentionWorker] Fatal cleanup worker error:",
        error.message,
      );
    }
  }
}
