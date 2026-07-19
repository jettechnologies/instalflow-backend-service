import type { Request, Response, NextFunction } from "express";
import AppError, { ErrorType } from "@/shared/utils/AppError";
import { verifyOnboardingToken } from "@/shared/utils/password-hash-verify";

declare global {
  namespace Express {
    interface Request {
      onboardingSessionId?: string;
    }
  }
}

export const requireOnboardingToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(
        401,
        "Missing onboarding token. Please complete registration first.",
        ErrorType.UNAUTHORIZED,
      );
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyOnboardingToken(token);

    req.onboardingSessionId = payload.sessionId;

    next();
  } catch (err: any) {
    next(
      new AppError(
        401,
        err.message ||
          "Onboarding token expired or invalid. Please register again.",
        ErrorType.UNAUTHORIZED,
      ),
    );
  }
};
