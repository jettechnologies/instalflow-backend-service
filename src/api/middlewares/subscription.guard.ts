import type { Request, Response, NextFunction } from "express";
import { prisma, Role, SubscriptionStatus } from "@/infrastructure/prisma";
import AppError, { ErrorType } from "@/shared/utils/AppError";

const EXEMPT_ROLES: string[] = [Role.SUPER_ADMIN, Role.CUSTOMER];
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

/**
 * Blocks mutating requests for companies whose SaaS subscription has lapsed
 * into RESTRICTED. Reads stay open (a business can always see/export its
 * data); only new activity is cut off until they renew. CUSTOMER is exempt
 * so a merchant's own lapsed subscription never blocks its customers from
 * paying installments — see PROJECT_WORKFLOW.md's "Never Trust Client, but
 * always let the customer pay" principle.
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (SAFE_METHODS.includes(req.method)) return next();
  if (!req.user?.companyId) return next();
  if (EXEMPT_ROLES.includes(req.user.role)) return next();

  const subscription = await prisma.companySubscription.findFirst({
    where: { companyId: req.user.companyId },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });

  if (subscription?.status === SubscriptionStatus.RESTRICTED) {
    return next(
      new AppError(
        403,
        "Your company's subscription is restricted due to a lapsed renewal. Renew your subscription to resume full access.",
        ErrorType.FORBIDDEN,
      ),
    );
  }

  next();
};
