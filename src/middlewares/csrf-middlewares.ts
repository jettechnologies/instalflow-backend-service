import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import logger from "../libs/logger";

const TOKEN_SECRET = process.env.CSRF_SECRET;
if (!TOKEN_SECRET) {
  logger.warn(
    "CSRF_SECRET is not set. Add it to your environment variables. Falling back to an insecure default — fix this before going to production.",
  );
}
const SECRET = TOKEN_SECRET ?? "must-set-csrf-secret-in-env";

// Generate a random token
const createCsrfToken = (): string => crypto.randomBytes(32).toString("hex");

// Hash the token using HMAC-SHA256
const hashToken = (token: string): string =>
  crypto.createHmac("sha256", SECRET).update(token).digest("hex");

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      csrfToken?: () => string;
    }
  }
}

const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const path = req.originalUrl.split("?")[0];

  const isAuthRoute = path.startsWith("/api/v1/auth/");
  const isWebhookRoute = path.startsWith("/api/v1/webhooks/");
  const isBearerAuth = req.headers.authorization?.startsWith("Bearer ");
  const isCsrfEndpoint = path === "/api/v1/csrf-token";

  // Skip CSRF for auth routes, bearer token authenticated requests, or the CSRF endpoint itself
  if (isAuthRoute || isBearerAuth || isCsrfEndpoint || isWebhookRoute) {
    return next();
  }

  // Auto-generate/refresh tokens on standard GET requests to ensure cookies are always present
  if (req.method === "GET") {
    const rawToken = req.cookies?.["csrf_token"] || createCsrfToken();
    const hashed = hashToken(rawToken);

    if (!req.cookies?.["csrf_hash"]) {
      res.cookie("csrf_hash", hashed, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3 * 24 * 60 * 60 * 1000,
      });
    }

    if (!req.cookies?.["csrf_token"]) {
      res.cookie("csrf_token", rawToken, {
        httpOnly: false,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3 * 24 * 60 * 60 * 1000,
      });
    }

    req.csrfToken = () => rawToken;
    return next();
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const clientToken =
      (req.headers["x-csrf-token"] as string) || req.body?._csrf;
    const storedHash = req.cookies?.["csrf_hash"];

    if (!clientToken || !storedHash) {
      logger.warn(
        `CSRF Validation Failed: clientToken=${!!clientToken}, storedHash=${!!storedHash}`,
      );
      return res.status(403).json({
        error: "Missing CSRF token",
        message:
          "A valid CSRF token is required for this operation. Perform a GET request to /api/v1/csrf-token first.",
      });
    }

    const expectedHash = hashToken(clientToken);

    try {
      const valid = crypto.timingSafeEqual(
        Buffer.from(expectedHash, "hex"),
        Buffer.from(storedHash, "hex"),
      );

      if (!valid) {
        return res.status(403).json({ error: "Invalid CSRF token" });
      }
    } catch {
      return res.status(403).json({ error: "Invalid CSRF token format" });
    }
  }

  return next();
};

export default csrfMiddleware;
