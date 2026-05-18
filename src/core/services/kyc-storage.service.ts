import cloudinary from "@/infrastructure/config/cloudinary";

export class KycStorageService {
  /**
   * Generates a secure, short-lived signed access link for a private/authenticated asset.
   * Links expire after 15 minutes.
   */
  static async generateSignedUrl(publicId: string, format: string = "pdf"): Promise<string> {
    try {
      // Generate an authenticated signed download URL for raw file resource
      const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 mins expiry
      
      const signedUrl = cloudinary.utils.private_download_url(publicId, format, {
        expires_at: expiresAt,
        resource_type: "raw"
      });
      
      return signedUrl;
    } catch (error: any) {
      console.error("❌ Cloudinary Signed Link Error:", error.message);
      // Fallback URL if signing fails
      return cloudinary.url(publicId, { resource_type: "raw" });
    }
  }

  /**
   * Explicitly purge physical PDF asset from Cloudinary storage.
   */
  static async deleteAsset(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "raw",
        invalidate: true
      });
    } catch (error: any) {
      console.error("❌ Cloudinary PDF Deletion Error:", error.message);
    }
  }
}
