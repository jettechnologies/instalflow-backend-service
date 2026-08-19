import type { Request, Response, NextFunction } from "express";
import { prisma, Role, CompanyStatus } from "@/infrastructure/prisma";
import AppError, { ErrorType } from "@/shared/utils/AppError";

const EXEMPT_ROLES: string[] = [Role.SUPER_ADMIN, Role.CUSTOMER];
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

/**
 * Blocks mutating requests for a company SUPER_ADMIN has suspended (fraud,
 * ToS violation, non-payment escalation). Mirrors requireActiveSubscription's
 * shape exactly: reads stay open, CUSTOMER is exempt so a suspended
 * merchant's customers can still pay off installments they already owe,
 * SUPER_ADMIN is exempt so the platform operator can still investigate.
 */
export const requireActiveCompany = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (SAFE_METHODS.includes(req.method)) return next();
  if (!req.user?.companyId) return next();
  if (EXEMPT_ROLES.includes(req.user.role)) return next();

  const company = await prisma.company.findUnique({
    where: { companyId: req.user.companyId },
    select: { status: true },
  });

  if (company?.status === CompanyStatus.SUSPENDED) {
    return next(
      new AppError(
        403,
        "This company has been suspended by the platform. Contact support for details.",
        ErrorType.FORBIDDEN,
      ),
    );
  }

  next();
};
