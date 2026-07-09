import {
  Prisma,
  prisma,
  PaymentIntentType,
  PaymentInitStatus,
} from "@/infrastructure/prisma";
import { PaymentIntentService } from "@/core/services/payment-intent.service";
import logger from "@/infrastructure/logger/logger";

const RECOVERY_THRESHOLD_MS = 60 * 1000;
const RECOVERY_BATCH_SIZE = 20;

export class PaymentRecoveryWorker {
  static async runRecovery(): Promise<void> {
    console.log(
      "🔁 [PaymentRecoveryWorker] Starting stale-intent recovery sweep...",
    );

    try {
      const claimedIds = await this.claimStaleIntents();

      console.log(
        `🔁 [PaymentRecoveryWorker] Claimed ${claimedIds.length} stale INITIALIZING intent(s).`,
      );

      for (const intentId of claimedIds) {
        try {
          await this.recoverIntent(intentId);
        } catch (err: any) {
          logger.error("[PaymentRecoveryWorker] Failed to recover intent", {
            intentId,
            error: err.message,
          });
        }
      }

      const { expiredCount } = await PaymentIntentService.expireStale();
      if (expiredCount > 0) {
        console.log(
          `⌛ [PaymentRecoveryWorker] Expired ${expiredCount} stale intent(s).`,
        );
      }

      console.log("🔁 [PaymentRecoveryWorker] Recovery sweep completed.");
    } catch (error: any) {
      console.error(
        "❌ [PaymentRecoveryWorker] Fatal recovery worker error:",
        error.message,
      );
    }
  }

  private static async claimStaleIntents(): Promise<string[]> {
    const staleThreshold = new Date(Date.now() - RECOVERY_THRESHOLD_MS);

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ intentId: string }[]>`
        SELECT "intentId" FROM "PaymentIntent"
        WHERE status = 'INITIALIZING'
          AND "updatedAt" <= ${staleThreshold}
        ORDER BY "updatedAt" ASC
        LIMIT ${RECOVERY_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      const ids = rows.map((r) => r.intentId);
      if (ids.length === 0) return [];

      await tx.$executeRaw`
        UPDATE "PaymentIntent"
        SET "updatedAt" = now()
        WHERE "intentId" IN (${Prisma.join(ids)})
      `;

      return ids;
    });
  }

  private static async recoverIntent(intentId: string): Promise<void> {
    const intent = await prisma.paymentIntent.findUnique({
      where: { intentId },
    });

    if (!intent || intent.status !== PaymentInitStatus.INITIALIZING) {
      return;
    }

    if (intent.expiresAt.getTime() < Date.now()) {
      await PaymentIntentService.markExpired(intent.intentId);
      console.log(
        `⌛ [PaymentRecoveryWorker] Intent ${intentId} expired before recovery.`,
      );
      return;
    }

    const resolved = await this.resolveInitParams(intent);

    if (!resolved) {
      logger.error(
        "[PaymentRecoveryWorker] Could not resolve email/metadata for stuck intent — marking FAILED",
        { intentId, type: intent.type },
      );
      await PaymentIntentService.markFailed(intent.intentId);
      return;
    }

    try {
      await PaymentIntentService.initializePaystack(intent.intentId, resolved);
      console.log(
        `✅ [PaymentRecoveryWorker] Recovered intent ${intentId} → INITIALIZED.`,
      );
    } catch (err: any) {
      logger.warn(
        "[PaymentRecoveryWorker] Paystack retry failed for stuck intent",
        { intentId, error: err.message },
      );
    }
  }

  private static async resolveInitParams(
    intent: Prisma.PaymentIntentGetPayload<{}>,
  ): Promise<{ email: string; metadata: Record<string, unknown> } | null> {
    switch (intent.type) {
      case PaymentIntentType.INSTALLMENT: {
        if (!intent.installmentId) return null;

        const installment = await prisma.installment.findUnique({
          where: { installmentId: intent.installmentId },
          include: {
            financingContract: { include: { user: true, product: true } },
          },
        });

        if (!installment) return null;

        return {
          email: installment.financingContract.user.email,
          metadata: {
            installmentId: installment.installmentId,
            financingContractId: installment.financingContractId,
            productId: installment.financingContract.product.productId,
            sequence: installment.sequence,
          },
        };
      }

      case PaymentIntentType.ONBOARDING: {
        if (!intent.onboardingId) return null;

        const onboardingIntent = await prisma.onboardingIntent.findUnique({
          where: { intentId: intent.onboardingId },
        });

        if (!onboardingIntent) return null;

        return {
          email: onboardingIntent.email,
          metadata: { intentId: onboardingIntent.intentId },
        };
      }

      case PaymentIntentType.SUBSCRIPTION: {
        if (!intent.companyId) return null;

        const companyOwner = await prisma.user.findFirst({
          where: { companyId: intent.companyId, role: "COMPANY" },
          select: { email: true },
        });

        if (!companyOwner) return null;

        return {
          email: companyOwner.email,
          metadata: { companyId: intent.companyId, planId: intent.planId },
        };
      }

      default:
        return null;
    }
  }
}
