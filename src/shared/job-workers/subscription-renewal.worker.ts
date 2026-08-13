import { prisma, SubscriptionStatus } from "@/infrastructure/prisma";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";
import {
  dayWindow,
  ensureReminderSent,
} from "@/shared/utils/helpers/date-window";
import logger from "@/infrastructure/logger/logger";

const include = {
  plan: true,
  company: {
    include: {
      users: { where: { role: "COMPANY" as const }, select: { email: true } },
    },
  },
} as const;

type SubscriptionWithRelations = Awaited<
  ReturnType<typeof prisma.companySubscription.findFirst<{ include: typeof include }>>
>;

// Mirrors PaymentReminderWorker's shape exactly (dayWindow + Redis idempotency
// + emitEvent per row), but for company SaaS subscription renewal — a
// separate flow from installment reminders (different audience, different
// stakes). See DOMAIN_MODEL.md §9 "Billing".
export class SubscriptionRenewalWorker {
  static async run(): Promise<void> {
    logger.info("[SubscriptionRenewalWorker] Starting renewal scan...");

    await Promise.allSettled([
      this.process7DayReminder(),
      this.process3DayReminder(),
      this.processExpiresTodayReminder(),
      this.processGracePeriodTransition(),
      this.processGracePeriodExpiryReminder(),
      this.processRestrictedTransition(),
    ]);

    logger.info("[SubscriptionRenewalWorker] Scan complete.");
  }

  private static basePayload(sub: NonNullable<SubscriptionWithRelations>) {
    return {
      companyId: sub.companyId,
      companyEmails: sub.company.users.map((u) => u.email),
      companyName: sub.company.name,
      planName: sub.plan.name,
      endDate: sub.endDate?.toISOString() ?? "",
      payment_url: process.env.FRONTEND_URL,
      dashboard_url: process.env.FRONTEND_URL,
    };
  }

  private static async process7DayReminder(): Promise<void> {
    const { start, end } = dayWindow(7);

    const subs = await prisma.companySubscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        endDate: { gte: start, lt: end },
      },
      include,
    });

    for (const sub of subs) {
      const claimed = await ensureReminderSent(sub.subscriptionId, "7day");
      if (!claimed) continue;

      await emitEvent(
        DomainEvent.SUBSCRIPTION_RENEWAL_REMINDER_7DAY,
        this.basePayload(sub),
      );
    }
  }

  private static async process3DayReminder(): Promise<void> {
    const { start, end } = dayWindow(3);

    const subs = await prisma.companySubscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        endDate: { gte: start, lt: end },
      },
      include,
    });

    for (const sub of subs) {
      const claimed = await ensureReminderSent(sub.subscriptionId, "3day");
      if (!claimed) continue;

      await emitEvent(
        DomainEvent.SUBSCRIPTION_RENEWAL_REMINDER_3DAY,
        this.basePayload(sub),
      );
    }
  }

  private static async processExpiresTodayReminder(): Promise<void> {
    const { start, end } = dayWindow(0);

    const subs = await prisma.companySubscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        endDate: { gte: start, lt: end },
      },
      include,
    });

    for (const sub of subs) {
      const claimed = await ensureReminderSent(
        sub.subscriptionId,
        "expires-today",
      );
      if (!claimed) continue;

      await emitEvent(
        DomainEvent.SUBSCRIPTION_EXPIRES_TODAY,
        this.basePayload(sub),
      );
    }
  }

  /** ACTIVE subscriptions whose endDate has passed move to GRACE_PERIOD. */
  private static async processGracePeriodTransition(): Promise<void> {
    const now = new Date();

    const subs = await prisma.companySubscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE, endDate: { lt: now } },
      include,
    });

    for (const sub of subs) {
      await prisma.companySubscription.update({
        where: { subscriptionId: sub.subscriptionId },
        data: { status: SubscriptionStatus.GRACE_PERIOD },
      });

      await emitEvent(DomainEvent.SUBSCRIPTION_GRACE_PERIOD_STARTED, {
        ...this.basePayload(sub),
        gracePeriodDays: sub.plan.gracePeriodDays,
      });
    }
  }

  /** GRACE_PERIOD subscriptions with 1 day left before restriction. */
  private static async processGracePeriodExpiryReminder(): Promise<void> {
    const now = new Date();

    const subs = await prisma.companySubscription.findMany({
      where: { status: SubscriptionStatus.GRACE_PERIOD },
      include,
    });

    for (const sub of subs) {
      if (!sub.endDate) continue;

      const graceExpiresAt = new Date(
        sub.endDate.getTime() + sub.plan.gracePeriodDays * 24 * 60 * 60 * 1000,
      );
      const daysLeft = Math.ceil(
        (graceExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );

      if (daysLeft !== 1) continue;

      const claimed = await ensureReminderSent(
        sub.subscriptionId,
        "grace-expiring",
      );
      if (!claimed) continue;

      await emitEvent(DomainEvent.SUBSCRIPTION_GRACE_PERIOD_EXPIRING, {
        ...this.basePayload(sub),
        gracePeriodDays: sub.plan.gracePeriodDays,
      });
    }
  }

  /** GRACE_PERIOD subscriptions whose grace window has fully elapsed move to RESTRICTED. */
  private static async processRestrictedTransition(): Promise<void> {
    const now = new Date();

    const subs = await prisma.companySubscription.findMany({
      where: { status: SubscriptionStatus.GRACE_PERIOD },
      include,
    });

    for (const sub of subs) {
      if (!sub.endDate) continue;

      const graceExpiresAt = new Date(
        sub.endDate.getTime() + sub.plan.gracePeriodDays * 24 * 60 * 60 * 1000,
      );
      if (graceExpiresAt > now) continue;

      await prisma.companySubscription.update({
        where: { subscriptionId: sub.subscriptionId },
        data: { status: SubscriptionStatus.RESTRICTED },
      });

      await emitEvent(
        DomainEvent.SUBSCRIPTION_RESTRICTED,
        this.basePayload(sub),
      );
    }
  }
}
