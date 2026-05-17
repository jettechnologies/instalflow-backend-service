import type { Request, Response, NextFunction } from "express";
import { prisma } from "@/infrastructure/prisma";
import AppError, { ErrorType } from "@/shared/utils/AppError";
import { verifyAccessToken } from "@/shared/utils/password-hash-verify";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
        companyId?: string;
        sessionId?: string;
      };
    }
  }
}

/**
 * Validates the short-lived access token specifically.
 * Drops request if missing / malformed / expired / revoked.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(
        401,
        "Missing or invalid authorization header",
        ErrorType.UNAUTHORIZED,
      );
    }

    const token = authHeader.split(" ")[1];

    // 1. Verify token signature and expiry
    const decoded = verifyAccessToken(token);

    // 2. Check Database for Session Revocation
    // This turns our stateless JWT into a stateful session check.
    const activeSession = await prisma.userSession.findUnique({
      where: { sessionId: decoded.sessionId },
    });

    if (!activeSession || activeSession.revoked || activeSession.expiresAt < new Date()) {
      throw new AppError(
        401,
        "Session has been revoked or expired. Please login again.",
        ErrorType.UNAUTHORIZED,
      );
    }

    req.user = decoded;

    next();
  } catch (err: any) {
    next(
      new AppError(
        401,
        err.message || "Token expired or invalid constraints",
        ErrorType.UNAUTHORIZED,
      ),
    );
  }
};

/**
 * Multi-layer capability role restriction map.
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          "Forbidden: Insufficient privileges for action",
          ErrorType.FORBIDDEN,
        ),
      );
    }
    next();
  };
};
