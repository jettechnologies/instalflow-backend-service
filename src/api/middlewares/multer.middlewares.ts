import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { BadRequestError } from "@/shared/utils/AppError";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "../../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),

  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const FILE_SIZE_LIMITS: Record<string, number> = {
  jpg: 5 * 1024 * 1024,
  jpeg: 5 * 1024 * 1024,
  png: 5 * 1024 * 1024,
  webp: 5 * 1024 * 1024,
  gif: 10 * 1024 * 1024,

  mp4: 15 * 1024 * 1024,
  mov: 15 * 1024 * 1024,
  avi: 15 * 1024 * 1024,
  mkv: 15 * 1024 * 1024,
};

const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|mov|avi|mkv/;

  const allowedImageMimeTypes = /image\/(jpeg|jpg|png|gif|webp)/;

  const allowedVideoMimeTypes = /video\/(mp4|quicktime|x-msvideo|x-matroska)/;

  const extname = path.extname(file.originalname).toLowerCase().substring(1);

  const mimetype = file.mimetype;

  const isExtValid =
    allowedImageTypes.test(extname) || allowedVideoTypes.test(extname);

  const isMimeValid =
    allowedImageMimeTypes.test(mimetype) ||
    allowedVideoMimeTypes.test(mimetype);

  if (!isExtValid || !isMimeValid) {
    return cb(new BadRequestError("Only image and video files are allowed."));
  }

  const maxSize = FILE_SIZE_LIMITS[extname];

  if (!req.fileSizeLimits) {
    req.fileSizeLimits = {};
  }

  req.fileSizeLimits[file.fieldname] = maxSize;

  cb(null, true);
};

const limits = {
  fileSize: 20 * 1024 * 1024,
};

export const uploadSingle = (fieldName: string) =>
  multer({
    storage,
    fileFilter,
    limits,
  }).single(fieldName);

export const uploadMultiple = (fieldName: string) =>
  multer({
    storage,
    fileFilter,
    limits,
  }).array(fieldName, 10);

export const validateUploadedFileSizes = (req: any, _res: any, next: any) => {
  const files = req.files || (req.file ? [req.file] : []);

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase().substring(1);

    const maxSize = FILE_SIZE_LIMITS[ext];

    if (file.size > maxSize) {
      return next(
        new BadRequestError(
          `${ext.toUpperCase()} files must be under ${
            maxSize / (1024 * 1024)
          }MB.`,
        ),
      );
    }
  }

  next();
};

const PDF_SIZE_LIMIT = 10 * 1024 * 1024;

const pdfFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;

  if (extname !== ".pdf" || mimetype !== "application/pdf") {
    return cb(new BadRequestError("Only PDF (.pdf) documents are accepted."));
  }

  cb(null, true);
};

export const uploadSinglePdf = (fieldName: string) =>
  multer({
    storage,
    fileFilter: pdfFilter,
    limits: { fileSize: PDF_SIZE_LIMIT },
  }).single(fieldName);
