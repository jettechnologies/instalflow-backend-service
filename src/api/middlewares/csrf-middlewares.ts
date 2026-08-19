import type { Request, Response, NextFunction } from "express";
import logger from "@/infrastructure/logger/logger";
import { hashToken, safeCompare } from "@/shared/utils/helpers/csrf.helper";

const skipCsrf = (req: Request): boolean => {
  const path = req.originalUrl.split("?")[0];

  return (
    path.startsWith("/api/v1/auth/") ||
    path.startsWith("/api/v1/webhooks/") ||
    path === "/api/v1/health" ||
    // Every other /kyc/* route is Bearer-authenticated (real access token or
    // onboarding token) and already covered by the check below — this is
    // the one genuinely public, session-less route. Deliberately not a
    // blanket "/api/v1/kyc/" prefix: that would silently exempt any future
    // cookie-session-based kyc route from CSRF protection too.
    path === "/api/v1/kyc/register" ||
    path === "/api/v1/csrf-token" ||
    !!req.headers.authorization?.startsWith("Bearer ")
  );
};

const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (skipCsrf(req)) return next();

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  const clientToken = req.headers["x-csrf-token"] as string;
  const storedHash = req.cookies?.csrf_hash;

  if (!clientToken || !storedHash) {
    logger.warn("CSRF missing token or hash");

    return res.status(403).json({
      error: "Missing CSRF token",
    });
  }

  const valid = safeCompare(hashToken(clientToken), storedHash);

  if (!valid) {
    logger.warn("CSRF validation failed");

    return res.status(403).json({
      error: "Invalid CSRF token",
    });
  }

  return next();
};

export default csrfMiddleware;
