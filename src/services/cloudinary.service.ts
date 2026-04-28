import { env } from "../config/env";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "../config/cloudinary";
import fs from "fs";

export interface CloudinaryUploadResult {
  url: string;
  public_id: string;
  format: string;
  resource_type: string;
}

/**
 * Upload file to Cloudinary
 */
export const uploadToCloudinary = async (
  filePath: string,
  folder: "products" | "companies" | "profile" | "categories" | "documents",
): Promise<CloudinaryUploadResult> => {
  try {
    const uniqueId = uuidv4();

    const result = await cloudinary.uploader.upload(filePath, {
      folder: `${env.cloudinary.base_folder}/${folder}`,
      public_id: `${folder}_${uniqueId}`,
      resource_type: "auto",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });

    // Remove temp file after successful upload
    fs.unlink(filePath, (err) => {
      if (err) console.warn("⚠️ Failed to delete temp file:", err.message);
    });

    return {
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      resource_type: result.resource_type,
    };
  } catch (error: any) {
    console.error("❌ Cloudinary Upload Error:", error.message);
    throw new Error("Failed to upload file to Cloudinary");
  }
};

/**
 * Delete file from Cloudinary
 */
export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error: any) {
    console.error("❌ Cloudinary Deletion Error:", error.message);
  }
};
