import { prisma } from "@/infrastructure/prisma";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";

/**
 * OnboardingService — owns the referral onboarding lifecycle (Option B).
 *
 * Responsibilities:
 *  - Provisional `OnboardingSession` expiry (cron-driven sweep).
 *
 * Design notes:
 *  - Concurrency safe: stale sessions are "claimed" by flipping them to an
 *    intermediate `EXPIRING` status inside a transaction before any side
 *    effects run. With multiple worker instances, each claimed row is touched
 *    exactly once — a second worker's `updateMany` matches 0 rows and skips it.
 *    (On Postgres this is also protected by row-level locks; the status flip is
 *    the portable, idempotent guard.)
 *  - Per-session transaction: each expired session is processed in its own
 *    transaction so a failure on one row cannot roll back the whole batch.
 *  - Extensibility: expiration does NOT directly perform notification / audit /
 *    metrics / document cleanup. It emits `ONBOARDING_SESSION_EXPIRED`; the
 *    downstream handlers (see OnboardingSweeperWorker) react — keeping this
 *    service free of cross-cutting concerns.
 */
export class OnboardingService {
  /**
   * Claims and expires stale provisional onboarding sessions.
   *
   * @param batchSize max sessions to process per invocation (drain in batches)
   * @returns number of sessions actually expired this run
   */
  static async expireStaleOnboardingSessions(batchSize = 500): Promise<number> {
    const now = new Date();

    // 1. Atomic claim: move stale PENDING_KYC/KYC_SUBMITTED rows into the
    //    intermediate EXPIRING state. `updateMany` returns the count it
    //    actually touched, so concurrent workers never double-process.
    const claimed = await prisma.onboardingSession.updateMany({
      where: {
        status: { in: ["PENDING_KYC", "KYC_SUBMITTED"] },
        expiresAt: { lt: now },
      },
      data: {
        status: "EXPIRING",
        passwordHash: "",
      },
    });

    if (claimed.count === 0) return 0;

    const stale = await prisma.onboardingSession.findMany({
      where: { status: "EXPIRING" },
      select: {
        sessionId: true,
        email: true,
        name: true,
        kycApplication: {
          select: { kycApplicationId: true },
        },
        marketerId: true,
        companyId: true,
      },
      take: batchSize,
    });

    for (const session of stale) {
      let marketerId: string | null = null;
      let marketerEmail: string | null = null;
      let marketerName: string | null = null;
      let companyId: string | null = null;
      let companyEmails: string[] = [];

      await prisma.$transaction(async (tx) => {
        const finalized = await tx.onboardingSession.updateMany({
          where: { sessionId: session.sessionId, status: "EXPIRING" },
          data: { status: "EXPIRED", completedAt: null },
        });

        if (finalized.count === 0) return;

        if (session.kycApplication) {
          await tx.kycApplication.update({
            where: {
              kycApplicationId: session.kycApplication.kycApplicationId,
            },
            data: {
              status: "REJECTED",
              rejectionReason: "Onboarding session expired.",
            },
          });
        }
      });

      // Resolve marketer and company context for notifications
      if (session.marketerId || session.companyId) {
        const sessionFull = await prisma.onboardingSession.findUnique({
          where: { sessionId: session.sessionId },
          include: {
            marketer: {
              include: {
                creator: { select: { email: true, name: true } },
              },
            },
            company: {
              include: {
                users: {
                  where: { role: { in: ["COMPANY", "ADMIN"] } },
                  select: { email: true, name: true, role: true },
                },
              },
            },
          },
        });

        if (sessionFull) {
          marketerId = sessionFull.marketerId;
          companyId = sessionFull.companyId;
          marketerEmail = sessionFull.marketer?.email ?? null;
          marketerName = sessionFull.marketer?.name ?? null;
          companyEmails = sessionFull.company?.users.map((u) => u.email) ?? [];
        }
      }

      emitEvent(DomainEvent.ONBOARDING_SESSION_EXPIRED, {
        sessionId: session.sessionId,
        email: session.email,
        hadKycApplication: !!session.kycApplication,
        customerName: session.email,
        customerEmail: session.name,
        marketerId: marketerId ?? "",
        marketerEmail: marketerEmail ?? "",
        marketerName: marketerName ?? "",
        companyId: companyId ?? "",
        companyEmails,
      });
    }

    return stale.length;
  }
}
