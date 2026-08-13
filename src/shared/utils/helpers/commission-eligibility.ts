import { Role } from "@/infrastructure/prisma";

// Roles allowed to be a customer's commission-eligible referrer. A MARKETER
// earns commission via referral; an ADMIN may also acquire customers directly
// (see KycService.registerDirect) and earns commission the same way. Adding a
// future participant type (e.g. PARTNER) is a one-line change here.
export const COMMISSION_ELIGIBLE_ROLES: Role[] = [Role.MARKETER, Role.ADMIN];

export function isCommissionEligible(role: Role | null | undefined): boolean {
  if (!role) return false;
  return COMMISSION_ELIGIBLE_ROLES.includes(role);
}
