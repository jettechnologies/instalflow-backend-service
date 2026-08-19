import { NotFoundError } from "@/shared/utils/AppError";

/**
 * Enforces the Company tenant boundary (see DOMAIN_MODEL.md §7 Identity) on a
 * company-owned resource mutation. SUPER_ADMIN is the platform operator and
 * has no companyId of its own, so it is exempt. Everyone else must belong to
 * the exact company that owns the resource.
 *
 * Throws NotFoundError (not Forbidden) on mismatch so a cross-tenant probe
 * can't distinguish "wrong company" from "doesn't exist" — same convention
 * already used in bank.service.ts.
 */
export function assertCompanyOwnership(
  resourceCompanyId: string | null | undefined,
  callerCompanyId: string | undefined,
  callerRole: string | undefined,
  notFoundMessage: string,
): void {
  if (callerRole === "SUPER_ADMIN") return;

  if (!callerCompanyId || resourceCompanyId !== callerCompanyId) {
    throw new NotFoundError(notFoundMessage);
  }
}
