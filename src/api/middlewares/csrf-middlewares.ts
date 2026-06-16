import type { Request, Response, NextFunction } from "express";
import logger from "@/infrastructure/logger/logger";
import { hashToken, safeCompare } from "@/shared/utils/helpers/csrf.helper";

const skipCsrf = (req: Request): boolean => {
  const path = req.originalUrl.split("?")[0];

  const isAuthRoute = path.startsWith("/api/v1/auth/");
  const isWebhook = path.startsWith("/api/v1/webhooks/");
  const isHealth = path === "/api/v1/health";
  const isKyc = path.startsWith("/api/v1/kyc/");
  const isCsrfEndpoint = path === "/api/v1/csrf-token";
  const isBearerAuth = !!req.headers.authorization?.startsWith("Bearer ");

  return (
    isAuthRoute ||
    isWebhook ||
    isHealth ||
    isKyc ||
    isCsrfEndpoint ||
    isBearerAuth
  );
};

const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (skipCsrf(req)) return next();

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  const clientToken =
    (req.headers["x-csrf-token"] as string) || req.body?._csrf;

  const storedHash = req.cookies?.csrf_hash;

  if (!clientToken || !storedHash) {
    logger.warn("CSRF missing token or hash");

    return res.status(403).json({
      error: "Missing CSRF token",
    });
  }

  const incomingHash = hashToken(clientToken);
  const valid = safeCompare(incomingHash, storedHash);

  if (!valid) {
    logger.warn("CSRF validation failed");

    return res.status(403).json({
      error: "Invalid CSRF token",
    });
  }

  return next();
};

export default csrfMiddleware;

// import type { Request, Response, NextFunction } from "express";
// import crypto from "crypto";
// import logger from "@/infrastructure/logger/logger";

// const TOKEN_SECRET = process.env.CSRF_SECRET;

// if (!TOKEN_SECRET) {
//   logger.warn(
//     "CSRF_SECRET is not set. Falling back to insecure default. Set CSRF_SECRET in production.",
//   );
// }

// const SECRET = TOKEN_SECRET ?? "must-set-csrf-secret-in-env";

// const createCsrfToken = (): string => crypto.randomBytes(32).toString("hex");

// const hashToken = (token: string): string =>
//   crypto.createHmac("sha256", SECRET).update(token).digest("hex");

// const safeCompare = (a: string, b: string): boolean => {
//   try {
//     const aBuffer = Buffer.from(a, "hex");
//     const bBuffer = Buffer.from(b, "hex");

//     if (aBuffer.length !== bBuffer.length) {
//       return false;
//     }

//     return crypto.timingSafeEqual(aBuffer, bBuffer);
//   } catch {
//     return false;
//   }
// };

// declare global {
//   namespace Express {
//     interface Request {
//       csrfToken?: () => string;
//     }
//   }
// }

// const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
//   const path = req.originalUrl.split("?")[0];

//   const isSecure =
//     process.env.NODE_ENV === "production" &&
//     (req.secure || req.headers["x-forwarded-proto"] === "https");

//   const isAuthRoute = path.startsWith("/api/v1/auth/");
//   const isHealthRoute = path === "/api/v1/health";
//   const isWebhookRoute = path.startsWith("/api/v1/webhooks/");
//   const isKycRoute = path.startsWith("/api/v1/kyc/");
//   const isBearerAuth = req.headers.authorization?.startsWith("Bearer ");

//   const isCsrfEndpoint = path === "/api/v1/csrf-token";

//   if (
//     isAuthRoute ||
//     isBearerAuth ||
//     isWebhookRoute ||
//     isHealthRoute ||
//     isKycRoute ||
//     isCsrfEndpoint
//   ) {
//     return next();
//   }

//   if (req.method === "GET") {
//     let rawToken = req.cookies?.csrf_token;
//     let storedHash = req.cookies?.csrf_hash;

//     if (!rawToken || !storedHash) {
//       rawToken = createCsrfToken();
//       storedHash = hashToken(rawToken);

//       const cookieOptions = {
//         httpOnly: false,
//         sameSite: "lax" as const,
//         secure: isSecure,
//         path: "/",
//         maxAge: 3 * 24 * 60 * 60 * 1000,
//       };

//       res.cookie("csrf_hash", storedHash, {
//         ...cookieOptions,
//       });

//       res.cookie("csrf_token", rawToken, {
//         ...cookieOptions,
//         // httpOnly: false,
//       });

//       logger.info("Generated new CSRF cookies");
//     }

//     req.csrfToken = () => rawToken;

//     return next();
//   }

//   if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
//     const clientToken =
//       (req.headers["x-csrf-token"] as string) || req.body?._csrf;

//     const storedHash = req.cookies?.csrf_hash;

//     if (!clientToken || !storedHash) {
//       logger.warn(
//         `CSRF Validation Failed: clientToken=${!!clientToken}, storedHash=${!!storedHash}`,
//       );

//       return res.status(403).json({
//         error: "Missing CSRF token",
//         message: "Perform a GET request to /api/v1/csrf-token first.",
//       });
//     }

//     const incomingHash = hashToken(clientToken);

//     const valid = safeCompare(incomingHash, storedHash);

//     if (!valid) {
//       logger.warn("Invalid CSRF token detected");

//       return res.status(403).json({
//         error: "Invalid CSRF token",
//       });
//     }
//   }

//   return next();
// };

// export default csrfMiddleware;

// import type { Request, Response, NextFunction } from "express";
// import crypto from "crypto";
// import logger from "@/infrastructure/logger/logger";

// const TOKEN_SECRET = process.env.CSRF_SECRET;

// if (!TOKEN_SECRET) {
//   logger.warn(
//     "CSRF_SECRET is not set. Falling back to insecure default. Set CSRF_SECRET in production.",
//   );
// }

// const SECRET = TOKEN_SECRET ?? "must-set-csrf-secret-in-env";

// const createCsrfToken = (): string => crypto.randomBytes(32).toString("hex");

// const hashToken = (token: string): string =>
//   crypto.createHmac("sha256", SECRET).update(token).digest("hex");

// const safeCompare = (a: string, b: string): boolean => {
//   try {
//     const aBuffer = Buffer.from(a, "hex");
//     const bBuffer = Buffer.from(b, "hex");

//     if (aBuffer.length !== bBuffer.length) {
//       return false;
//     }

//     return crypto.timingSafeEqual(aBuffer, bBuffer);
//   } catch {
//     return false;
//   }
// };

// declare global {
//   namespace Express {
//     interface Request {
//       csrfToken?: () => string;
//     }
//   }
// }

// const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
//   const path = req.originalUrl.split("?")[0];

//   const isSecure =
//     process.env.NODE_ENV === "production" &&
//     (req.secure || req.headers["x-forwarded-proto"] === "https");

//   const isAuthRoute = path.startsWith("/api/v1/auth/");
//   const isHealthRoute = path === "/api/v1/health";
//   const isWebhookRoute = path.startsWith("/api/v1/webhooks/");
//   const isBearerAuth = req.headers.authorization?.startsWith("Bearer ");

//   const isCsrfEndpoint = path === "/api/v1/csrf-token";

//   if (
//     isAuthRoute ||
//     isBearerAuth ||
//     isWebhookRoute ||
//     isHealthRoute ||
//     isCsrfEndpoint
//   ) {
//     return next();
//   }

//   if (req.method === "GET") {
//     const rawToken = req.cookies?.csrf_token || createCsrfToken();

//     const hashedToken = hashToken(rawToken);

//     res.cookie("csrf_hash", hashedToken, {
//       httpOnly: true,
//       sameSite: "lax",
//       secure: isSecure,
//       maxAge: 3 * 24 * 60 * 60 * 1000,
//     });

//     res.cookie("csrf_token", rawToken, {
//       httpOnly: false,
//       sameSite: "lax",
//       secure: isSecure,
//       maxAge: 3 * 24 * 60 * 60 * 1000,
//     });

//     req.csrfToken = () => rawToken;

//     return next();
//   }

//   if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
//     const clientToken =
//       (req.headers["x-csrf-token"] as string) || req.body?._csrf;

//     const storedHash = req.cookies?.csrf_hash;

//     if (!clientToken || !storedHash) {
//       logger.warn(
//         `CSRF Validation Failed: clientToken=${!!clientToken}, storedHash=${!!storedHash}`,
//       );

//       return res.status(403).json({
//         error: "Missing CSRF token",
//         message:
//           "A valid CSRF token is required. Perform a GET request to /api/v1/csrf-token first.",
//       });
//     }

//     const incomingHash = hashToken(clientToken);

//     const valid = safeCompare(incomingHash, storedHash);

//     if (!valid) {
//       logger.warn("Invalid CSRF token detected");

//       return res.status(403).json({
//         error: "Invalid CSRF token",
//       });
//     }
//   }

//   return next();
// };

// export default csrfMiddleware;

// import type { Request, Response, NextFunction } from "express";
// import crypto from "crypto";
// import logger from "@/infrastructure/logger/logger";

// const TOKEN_SECRET = process.env.CSRF_SECRET;
// if (!TOKEN_SECRET) {
//   logger.warn(
//     "CSRF_SECRET is not set. Add it to your environment variables. Falling back to an insecure default — fix this before going to production.",
//   );
// }
// const SECRET = TOKEN_SECRET ?? "must-set-csrf-secret-in-env";

// // Generate a random token
// const createCsrfToken = (): string => crypto.randomBytes(32).toString("hex");

// // Hash the token using HMAC-SHA256
// const hashToken = (token: string): string =>
//   crypto.createHmac("sha256", SECRET).update(token).digest("hex");

// // Extend Express Request type
// declare global {
//   namespace Express {
//     interface Request {
//       csrfToken?: () => string;
//     }
//   }
// }

// const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
//   const path = req.originalUrl.split("?")[0];

//   const isSecure =
//     process.env.NODE_ENV === "production" &&
//     req.headers["x-forwarded-proto"] === "https";

//   const isAuthRoute = path.startsWith("/api/v1/auth/");
//   const isHealthRoute = path === "/api/v1/health";
//   const isWebhookRoute = path.startsWith("/api/v1/webhooks/");
//   const isBearerAuth = req.headers.authorization?.startsWith("Bearer ");
//   const isCsrfEndpoint = path === "/api/v1/csrf-token";

//   // Skip CSRF for auth routes, bearer token authenticated requests, or the CSRF endpoint itself
//   if (
//     isAuthRoute ||
//     isBearerAuth ||
//     isCsrfEndpoint ||
//     isWebhookRoute ||
//     isHealthRoute
//   ) {
//     return next();
//   }

//   // Auto-generate/refresh tokens on standard GET requests to ensure cookies are always present
//   if (req.method === "GET") {
//     const rawToken = req.cookies?.["csrf_token"] || createCsrfToken();
//     const hashed = hashToken(rawToken);

//     if (!req.cookies?.["csrf_hash"]) {
//       res.cookie("csrf_hash", hashed, {
//         httpOnly: true,
//         sameSite: "lax",
//         // secure: process.env.NODE_ENV === "production",
//         secure: isSecure,
//         maxAge: 3 * 24 * 60 * 60 * 1000,
//       });
//     }

//     if (!req.cookies?.["csrf_token"]) {
//       res.cookie("csrf_token", rawToken, {
//         httpOnly: false,
//         sameSite: "lax",
//         // secure: process.env.NODE_ENV === "production",
//         secure: isSecure,
//         maxAge: 3 * 24 * 60 * 60 * 1000,
//       });
//     }

//     req.csrfToken = () => rawToken;
//     return next();
//   }

//   if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
//     const clientToken =
//       (req.headers["x-csrf-token"] as string) || req.body?._csrf;
//     const storedHash = req.cookies?.["csrf_hash"];

//     if (!clientToken || !storedHash) {
//       logger.warn(
//         `CSRF Validation Failed: clientToken=${!!clientToken}, storedHash=${!!storedHash}`,
//       );
//       return res.status(403).json({
//         error: "Missing CSRF token",
//         message:
//           "A valid CSRF token is required for this operation. Perform a GET request to /api/v1/csrf-token first.",
//       });
//     }

//     const expectedHash = hashToken(clientToken);

//     try {
//       const valid = crypto.timingSafeEqual(
//         Buffer.from(expectedHash, "hex"),
//         Buffer.from(storedHash, "hex"),
//       );

//       if (!valid) {
//         return res.status(403).json({ error: "Invalid CSRF token" });
//       }
//     } catch {
//       return res.status(403).json({ error: "Invalid CSRF token format" });
//     }
//   }

//   return next();
// };

// export default csrfMiddleware;
