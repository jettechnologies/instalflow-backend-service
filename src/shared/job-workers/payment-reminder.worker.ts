import {
  prisma,
  InstallmentStatus,
  FinancingStatus,
  Role,
  Prisma,
  Installment,
} from "@/infrastructure/prisma";
import { emitEvent } from "@/core/events/emitter";
import {
  DomainEvent,
  type Reminder3DayPayload,
  type Reminder1DayPayload,
  type DueTodayPayload,
  type OverdueRecurringPayload,
  type Overdue3DayPayload,
  type Overdue7DayPayload,
} from "@/core/events/event.types";
import logger from "@/infrastructure/logger/logger";
import {
  dayWindow,
  ensureReminderSent,
} from "@/shared/utils/helpers/date-window";
import {
  REMINDER_OFFSET_DAYS,
  MAX_REMINDER_OFFSET_DAYS,
} from "@/shared/utils/helpers/reminder-offset";
import {
  ReminderSettingsService,
  DEFAULT_REMINDER_SETTINGS,
  type EffectiveReminderSettings,
} from "@/core/services/reminder-settings.service";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const formatAmount = (val: Prisma.Decimal | string | number): string => {
  const num = typeof val === "object" ? val.toNumber() : Number(val);
  return `₦${num.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (d: Date): string =>
  d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

async function calculateProgress(contractId: string) {
  const contract = await prisma.financingContract.findFirst({
    where: { contractId },
    select: {
      totalFinanced: true,
      installments: { select: { amount: true, status: true } },
    },
  });

  if (!contract)
    return {
      percentagePaid: 0,
      totalFinanced: new Prisma.Decimal(0),
      totalPaid: new Prisma.Decimal(0),
    };

  let totalPaid = new Prisma.Decimal(0);
  for (const inst of contract.installments) {
    if (inst.status === InstallmentStatus.PAID) {
      totalPaid = totalPaid.plus(inst.amount);
    }
  }

  const percentagePaid = contract.totalFinanced.isZero()
    ? 0
    : Number(totalPaid.div(contract.totalFinanced).times(100).toFixed(2));

  return { percentagePaid, totalFinanced: contract.totalFinanced, totalPaid };
}

type SettingsMap = Map<string, EffectiveReminderSettings>;

function settingsFor(
  settingsMap: SettingsMap,
  companyId: string | null | undefined,
): EffectiveReminderSettings {
  if (!companyId) return DEFAULT_REMINDER_SETTINGS;
  return settingsMap.get(companyId) ?? DEFAULT_REMINDER_SETTINGS;
}

export class PaymentReminderWorker {
  static async run(): Promise<void> {
    console.log("🔔 [InstallmentPaymentReminder] Starting reminder scan...");
    const now = new Date();

    await this.transitionInstallmentStatuses(now);

    const settingsMap = await ReminderSettingsService.getEffectiveSettingsMap();

    await Promise.allSettled([
      this.process3DayReminders(settingsMap),
      this.process1DayReminders(settingsMap),
      this.processDueTodayReminders(settingsMap),
      this.processRecurringReminders(settingsMap),
      this.process3DayOverdue(settingsMap),
      this.process7DayOverdue(settingsMap),
    ]);

    console.log("✅ [InstallmentPaymentReminder] Scan complete.");
  }

  private static async transitionInstallmentStatuses(now: Date): Promise<void> {
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const threeDaysAgo = new Date(
      todayStart.getTime() - 3 * 24 * 60 * 60 * 1000,
    );

    const [pendingToDue, dueToOverdue] = await Promise.all([
      prisma.installment.updateMany({
        where: {
          status: InstallmentStatus.PENDING,
          dueDate: { lte: todayStart },
          financingContract: { status: FinancingStatus.ACTIVE },
        },
        data: { status: InstallmentStatus.DUE },
      }),
      prisma.installment.updateMany({
        where: {
          status: InstallmentStatus.DUE,
          dueDate: { lt: threeDaysAgo },
          financingContract: { status: FinancingStatus.ACTIVE },
        },
        data: { status: InstallmentStatus.OVERDUE },
      }),
    ]);

    if (pendingToDue.count > 0 || dueToOverdue.count > 0) {
      logger.debug(
        `🔄 [StatusTransition] PENDING→DUE: ${pendingToDue.count}, DUE→OVERDUE: ${dueToOverdue.count}`,
      );
    }
  }

  // Before-due family (3-day, 1-day) share a widened [today, today+MAX] query
  // window since each company's configured offset can be anywhere in that
  // range — the exact day is decided per-installment via `daysUntil`, not by
  // the DB query itself.
  private static async process3DayReminders(
    settingsMap: SettingsMap,
  ): Promise<void> {
    const { start: rangeStart } = dayWindow(0);
    const rangeEnd = new Date(
      rangeStart.getTime() + (MAX_REMINDER_OFFSET_DAYS + 1) * ONE_DAY_MS,
    );

    const installments = await prisma.installment.findMany({
      where: {
        dueDate: { gte: rangeStart, lt: rangeEnd },
        status: { in: [InstallmentStatus.PENDING, InstallmentStatus.DUE] },
        financingContract: { status: FinancingStatus.ACTIVE },
      },
      include: {
        financingContract: {
          include: {
            user: {
              select: {
                userId: true,
                email: true,
                name: true,
                companyId: true,
              },
            },
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    console.log(
      `📅 [InstallmentPaymentReminder] 3-day-family scan: ${installments.length} installment(s) in range`,
    );

    for (const inst of installments) {
      try {
        const contract = inst.financingContract;
        const customer = contract.user;
        const settings = settingsFor(settingsMap, customer?.companyId);

        const daysUntil = Math.round(
          (inst.dueDate.getTime() - rangeStart.getTime()) / ONE_DAY_MS,
        );

        if (
          !settings.reminder3DayEnabled ||
          daysUntil !== REMINDER_OFFSET_DAYS[settings.reminder3DayOffset]
        ) {
          continue;
        }

        const { percentagePaid } = await calculateProgress(
          inst.financingContractId,
        );

        const payload: Reminder3DayPayload = {
          customerEmail: customer?.email ?? "",
          customerName: customer?.name ?? "Customer",
          customerId: customer?.userId ?? "",
          installmentId: inst.installmentId,
          sequence: inst.sequence,
          dueDate: formatDate(inst.dueDate),
          amount: formatAmount(inst.amount),
          productName: contract.product.name,
          variantName: contract.variant?.sku,
          percentagePaid,
          daysUntil,
          payment_url: process.env.FRONTEND_URL,
          dashboard_url: process.env.FRONTEND_URL,
        };

        if (!(await ensureReminderSent(inst.installmentId, "3day"))) continue;

        await emitEvent(DomainEvent.INSTALLMENT_REMINDER_3DAY, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] 3-day reminder failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }

  private static async process1DayReminders(
    settingsMap: SettingsMap,
  ): Promise<void> {
    const { start: rangeStart } = dayWindow(0);
    const rangeEnd = new Date(
      rangeStart.getTime() + (MAX_REMINDER_OFFSET_DAYS + 1) * ONE_DAY_MS,
    );

    const installments = await prisma.installment.findMany({
      where: {
        dueDate: { gte: rangeStart, lt: rangeEnd },
        status: { in: [InstallmentStatus.PENDING, InstallmentStatus.DUE] },
        financingContract: { status: FinancingStatus.ACTIVE },
      },
      include: {
        financingContract: {
          include: {
            user: {
              select: {
                userId: true,
                email: true,
                name: true,
                companyId: true,
              },
            },
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    console.log(
      `📅 [InstallmentPaymentReminder] 1-day-family scan: ${installments.length} installment(s) in range`,
    );

    for (const inst of installments) {
      try {
        const contract = inst.financingContract;
        const customer = contract.user;
        const settings = settingsFor(settingsMap, customer?.companyId);

        const daysUntil = Math.round(
          (inst.dueDate.getTime() - rangeStart.getTime()) / ONE_DAY_MS,
        );

        if (
          !settings.reminder1DayEnabled ||
          daysUntil !== REMINDER_OFFSET_DAYS[settings.reminder1DayOffset]
        ) {
          continue;
        }

        const { percentagePaid } = await calculateProgress(
          inst.financingContractId,
        );

        const payload: Reminder1DayPayload = {
          customerEmail: customer?.email ?? "",
          customerName: customer?.name ?? "Customer",
          customerId: customer?.userId ?? "",
          installmentId: inst.installmentId,
          sequence: inst.sequence,
          dueDate: formatDate(inst.dueDate),
          amount: formatAmount(inst.amount),
          productName: contract.product.name,
          variantName: contract.variant?.sku,
          percentagePaid,
          daysUntil,
          payment_url: process.env.FRONTEND_URL,
          dashboard_url: process.env.FRONTEND_URL,
        };

        if (!(await ensureReminderSent(inst.installmentId, "1day"))) continue;

        await emitEvent(DomainEvent.INSTALLMENT_REMINDER_1DAY, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] 1-day reminder failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }

  private static async processDueTodayReminders(
    settingsMap: SettingsMap,
  ): Promise<void> {
    const { start, end } = dayWindow(0);

    const installments = await prisma.installment.findMany({
      where: {
        dueDate: { gte: start, lt: end },
        status: { in: [InstallmentStatus.PENDING, InstallmentStatus.DUE] },
        financingContract: { status: FinancingStatus.ACTIVE },
      },
      include: {
        financingContract: {
          include: {
            user: {
              select: {
                userId: true,
                email: true,
                name: true,
                companyId: true,
              },
            },
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    console.log(
      `📅 [InstallmentPaymentReminder] Due-today reminders: ${installments.length} installment(s)`,
    );

    for (const inst of installments) {
      try {
        const contract = inst.financingContract;
        const customer = contract.user;
        const settings = settingsFor(settingsMap, customer?.companyId);

        if (!settings.reminderDueTodayEnabled) continue;

        const { percentagePaid } = await calculateProgress(
          inst.financingContractId,
        );

        const payload: DueTodayPayload = {
          customerEmail: customer?.email ?? "",
          customerName: customer?.name ?? "Customer",
          customerId: customer?.userId ?? "",
          installmentId: inst.installmentId,
          sequence: inst.sequence,
          dueDate: formatDate(inst.dueDate),
          amount: formatAmount(inst.amount),
          productName: contract.product.name,
          variantName: contract.variant?.sku,
          percentagePaid,
          payment_url: process.env.FRONTEND_URL,
          dashboard_url: process.env.FRONTEND_URL,
        };

        if (!(await ensureReminderSent(inst.installmentId, "due-today")))
          continue;

        await emitEvent(DomainEvent.INSTALLMENT_DUE_TODAY, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] Due-today reminder failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }

  private static async processRecurringReminders(
    settingsMap: SettingsMap,
  ): Promise<void> {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const firstInstallmentRows = await prisma.$queryRaw<
      Pick<Installment, "installmentId">[]
    >`
      SELECT DISTINCT ON ("financingContractId") "installmentId"
      FROM "Installment"
      WHERE status IN ('PENDING', 'DUE', 'OVERDUE')
        AND "financingContractId" IN (
          SELECT "contractId" FROM "FinancingContract" WHERE status = 'ACTIVE'
        )
      ORDER BY "financingContractId", sequence ASC
    `;

    if (firstInstallmentRows.length === 0) {
      console.log(
        `🔄 [InstallmentPaymentReminder] Recurring overdue reminders: 0 installment(s)`,
      );
      return;
    }

    const installmentIds = firstInstallmentRows.map((r) => r.installmentId);

    const installments = await prisma.installment.findMany({
      where: { installmentId: { in: installmentIds } },
      include: {
        financingContract: {
          include: {
            user: {
              select: {
                userId: true,
                email: true,
                name: true,
                companyId: true,
              },
            },
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    console.log(
      `🔄 [InstallmentPaymentReminder] Recurring overdue reminders: ${installments.length} installment(s)`,
    );

    for (const inst of installments) {
      try {
        const contract = inst.financingContract;
        const customer = contract?.user;
        const settings = settingsFor(settingsMap, customer?.companyId);

        if (!settings.reminderRecurringOverdueEnabled) continue;

        const dueDate = new Date(inst.dueDate);
        const daysOverdue = Math.floor(
          (todayStart.getTime() - dueDate.getTime()) / ONE_DAY_MS,
        );

        if (daysOverdue < 1) continue;

        const { percentagePaid } = await calculateProgress(
          inst.financingContractId,
        );

        const payload: OverdueRecurringPayload = {
          customerEmail: customer?.email ?? "",
          customerName: customer?.name ?? "Customer",
          customerId: customer?.userId ?? "",
          installmentId: inst.installmentId,
          sequence: inst.sequence,
          dueDate: formatDate(inst.dueDate),
          amount: formatAmount(inst.amount),
          productName: contract?.product?.name ?? "",
          variantName: contract?.variant?.sku,
          percentagePaid,
          daysOverdue,
          payment_url: process.env.FRONTEND_URL,
          dashboard_url: process.env.FRONTEND_URL,
        };

        if (
          !(await ensureReminderSent(
            inst.installmentId,
            `recurring-${daysOverdue}`,
          ))
        )
          continue;

        await emitEvent(DomainEvent.INSTALLMENT_OVERDUE_RECURRING, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] Recurring overdue failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }

  // Overdue-escalation family (3-day→marketer, 7-day→marketer+admin) share a
  // widened [today-MAX, today] query window for the same reason as the
  // before-due family above.
  private static async process3DayOverdue(
    settingsMap: SettingsMap,
  ): Promise<void> {
    const { start: todayStart, end: rangeEnd } = dayWindow(0);
    const rangeStart = new Date(
      todayStart.getTime() - MAX_REMINDER_OFFSET_DAYS * ONE_DAY_MS,
    );

    const installments = await prisma.installment.findMany({
      where: {
        dueDate: { gte: rangeStart, lt: rangeEnd },
        status: { in: [InstallmentStatus.DUE, InstallmentStatus.OVERDUE] },
        financingContract: { status: FinancingStatus.ACTIVE },
      },
      include: {
        financingContract: {
          include: {
            user: {
              select: {
                userId: true,
                email: true,
                name: true,
                companyId: true,
                referredByMarketerId: true,
              },
            },
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    console.log(
      `🚨 [InstallmentPaymentReminder] 3-day-overdue-family scan: ${installments.length} installment(s) in range`,
    );

    for (const inst of installments) {
      try {
        const contract = inst.financingContract;
        const customer = contract.user;
        const settings = settingsFor(settingsMap, customer?.companyId);

        const daysOverdue = Math.floor(
          (todayStart.getTime() - inst.dueDate.getTime()) / ONE_DAY_MS,
        );

        if (
          !settings.reminderOverdue3DayEnabled ||
          daysOverdue !== REMINDER_OFFSET_DAYS[settings.reminderOverdue3DayOffset]
        ) {
          continue;
        }

        if (!customer?.referredByMarketerId) {
          console.warn(
            `[InstallmentPaymentReminder] Customer ${customer?.userId} has no marketer — skipping marketer notification for installment ${inst.installmentId}`,
          );
        }

        const marketer = customer?.referredByMarketerId
          ? await prisma.user.findUnique({
              where: {
                userId: customer.referredByMarketerId,
                role: Role.MARKETER,
              },
              select: { userId: true, email: true, name: true },
            })
          : null;

        const { percentagePaid } = await calculateProgress(
          inst.financingContractId,
        );

        const payload: Overdue3DayPayload = {
          customerEmail: customer?.email ?? "",
          customerName: customer?.name ?? "Customer",
          customerId: customer?.userId ?? "",
          installmentId: inst.installmentId,
          sequence: inst.sequence,
          dueDate: formatDate(inst.dueDate),
          amount: formatAmount(inst.amount),
          productName: contract.product.name,
          variantName: contract.variant?.sku,
          percentagePaid,
          daysOverdue,
          payment_url: process.env.FRONTEND_URL,
          // Marketer fields — fall back gracefully if no marketer
          marketerEmail: marketer?.email ?? "",
          marketerName: marketer?.name ?? "N/A",
          marketerId: marketer?.userId ?? "",
        };

        if (!(await ensureReminderSent(inst.installmentId, "overdue-3day")))
          continue;

        await emitEvent(DomainEvent.INSTALLMENT_OVERDUE_3DAY, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] 3-day overdue failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }

  private static async process7DayOverdue(
    settingsMap: SettingsMap,
  ): Promise<void> {
    const { start: todayStart, end: rangeEnd } = dayWindow(0);
    const rangeStart = new Date(
      todayStart.getTime() - MAX_REMINDER_OFFSET_DAYS * ONE_DAY_MS,
    );

    const installments = await prisma.installment.findMany({
      where: {
        dueDate: { gte: rangeStart, lt: rangeEnd },
        status: { in: [InstallmentStatus.DUE, InstallmentStatus.OVERDUE] },
        financingContract: { status: FinancingStatus.ACTIVE },
      },
      include: {
        financingContract: {
          include: {
            user: {
              select: {
                userId: true,
                email: true,
                name: true,
                companyId: true,
                referredByMarketerId: true,
              },
            },
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    console.log(
      `🚨 [InstallmentPaymentReminder] 7-day-overdue-family scan: ${installments.length} installment(s) in range`,
    );

    for (const inst of installments) {
      try {
        const contract = inst.financingContract;
        const customer = contract.user;
        const settings = settingsFor(settingsMap, customer?.companyId);

        const daysOverdue = Math.floor(
          (todayStart.getTime() - inst.dueDate.getTime()) / ONE_DAY_MS,
        );

        if (
          !settings.reminderOverdue7DayEnabled ||
          daysOverdue !== REMINDER_OFFSET_DAYS[settings.reminderOverdue7DayOffset]
        ) {
          continue;
        }

        const marketer = customer?.referredByMarketerId
          ? await prisma.user.findUnique({
              where: {
                userId: customer?.referredByMarketerId,
                role: Role.MARKETER,
              },
              select: {
                userId: true,
                email: true,
                name: true,
                createdById: true,
              },
            })
          : null;

        let admin: {
          userId: string;
          email: string;
          name: string | null;
        } | null = null;

        if (marketer?.createdById) {
          admin = await prisma.user.findUnique({
            where: {
              userId: marketer.createdById,
              role: { in: [Role.ADMIN, Role.COMPANY] },
            },
            select: { userId: true, email: true, name: true },
          });
        }

        if (!admin) {
          admin = await prisma.user.findFirst({
            where: { role: { in: [Role.SUPER_ADMIN] } },
            select: { userId: true, email: true, name: true },
          });
        }

        if (!admin) {
          console.warn(
            `[InstallmentPaymentReminder] No admin found for 7-day overdue on installment ${inst.installmentId}. Skipping.`,
          );
          continue;
        }

        const { percentagePaid } = await calculateProgress(
          inst.financingContractId,
        );

        const payload: Overdue7DayPayload = {
          customerEmail: customer?.email ?? "",
          customerName: customer?.name ?? "Customer",
          customerId: customer?.userId ?? "",
          installmentId: inst.installmentId,
          sequence: inst.sequence,
          dueDate: formatDate(inst.dueDate),
          expectedPaymentDate: formatDate(inst.dueDate),
          amount: formatAmount(inst.amount),
          productName: contract.product.name,
          variantName: contract.variant?.sku,
          percentagePaid,
          daysOverdue,
          payment_url: process.env.FRONTEND_URL,
          marketerEmail: marketer?.email ?? "",
          marketerName: marketer?.name ?? "N/A",
          marketerId: marketer?.userId ?? "",
          adminEmail: admin.email,
          adminName: admin.name ?? "Admin",
          adminId: admin.userId,
        };

        if (!(await ensureReminderSent(inst.installmentId, "overdue-7day")))
          continue;

        await emitEvent(DomainEvent.INSTALLMENT_OVERDUE_7DAY, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] 7-day overdue failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }
}
