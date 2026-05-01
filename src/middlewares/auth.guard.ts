import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import AppError, { ErrorType } from "../libs/AppError";
import { verifyAccessToken } from "@/libs/password-hash-verify";

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
 * Drops request if missing / malformed / expired.
 */
export const requireAuth = (
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

    // Natively throws if EXPIRED preventing access
    // const decoded = jwt.verify(token, ACCESS_SECRET) as {
    //   userId: string;
    //   email: string;
    //   role: string;
    //   companyId?: string;
    //   sessionId?: string;
    // };
    const decoded = verifyAccessToken(token);

    req.user = decoded;

    next();
  } catch (err) {
    next(
      new AppError(
        401,
        "Token expired or invalid constraints",
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
