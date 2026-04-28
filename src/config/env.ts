import dotenv from "dotenv";

dotenv.config();

export const env = {
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string,
    base_folder: process.env.CLOUDINARY_BASE_FOLDER as string,
  },
};
