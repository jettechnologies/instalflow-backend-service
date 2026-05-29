import {
  prisma,
  InstallmentStatus,
  FinancingStatus,
  Role,
  Prisma,
} from "@/infrastructure/prisma";
import { emitEvent } from "@/core/events/emitter";
import {
  DomainEvent,
  type Reminder3DayPayload,
  type DueTodayPayload,
  type Overdue3DayPayload,
  type Overdue7DayPayload,
} from "@/core/events/event.types";

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

function dayWindow(offsetDays: number): { start: Date; end: Date } {
  const now = new Date();
  const target = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
    ),
  );
  const next = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  return { start: target, end: next };
}

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

export class PaymentReminderWorker {
  static async run(): Promise<void> {
    console.log("🔔 [InstallmentPaymentReminder] Starting reminder scan...");
    const now = new Date();

    await Promise.allSettled([
      this.process3DayReminders(),
      this.processDueTodayReminders(now),
      this.process3DayOverdue(now),
      this.process7DayOverdue(now),
    ]);

    console.log("✅ [InstallmentPaymentReminder] Scan complete.");
  }

  private static async process3DayReminders(): Promise<void> {
    const { start, end } = dayWindow(+3);

    const installments = await prisma.installment.findMany({
      where: {
        dueDate: { gte: start, lt: end },
        status: { in: [InstallmentStatus.PENDING, InstallmentStatus.DUE] },
        financingContract: { status: FinancingStatus.ACTIVE },
      },
      include: {
        financingContract: {
          include: {
            user: { select: { userId: true, email: true, name: true } },
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    console.log(
      `📅 [InstallmentPaymentReminder] 3-day reminders: ${installments.length} installment(s)`,
    );

    for (const inst of installments) {
      try {
        const { percentagePaid } = await calculateProgress(
          inst.financingContractId,
        );
        const contract = inst.financingContract;
        const customer = contract.user;

        const payload: Reminder3DayPayload = {
          customerEmail: customer.email,
          customerName: customer.name ?? "Customer",
          customerId: customer.userId,
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

        await emitEvent(DomainEvent.INSTALLMENT_REMINDER_3DAY, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] 3-day reminder failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }

  private static async processDueTodayReminders(now: Date): Promise<void> {
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
            user: { select: { userId: true, email: true, name: true } },
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
        const { percentagePaid } = await calculateProgress(
          inst.financingContractId,
        );
        const contract = inst.financingContract;
        const customer = contract.user;

        const payload: DueTodayPayload = {
          customerEmail: customer.email,
          customerName: customer.name ?? "Customer",
          customerId: customer.userId,
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

        await emitEvent(DomainEvent.INSTALLMENT_DUE_TODAY, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] Due-today reminder failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }

  private static async process3DayOverdue(now: Date): Promise<void> {
    const { start, end } = dayWindow(-3);

    const installments = await prisma.installment.findMany({
      where: {
        dueDate: { gte: start, lt: end },
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
      `🚨 [InstallmentPaymentReminder] 3-day overdue: ${installments.length} installment(s)`,
    );

    for (const inst of installments) {
      try {
        const contract = inst.financingContract;
        const customer = contract.user;

        if (!customer.referredByMarketerId) {
          console.warn(
            `[InstallmentPaymentReminder] Customer ${customer.userId} has no marketer — skipping marketer notification for installment ${inst.installmentId}`,
          );
        }

        const marketer = customer.referredByMarketerId
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
          customerEmail: customer.email,
          customerName: customer.name ?? "Customer",
          customerId: customer.userId,
          installmentId: inst.installmentId,
          sequence: inst.sequence,
          dueDate: formatDate(inst.dueDate),
          amount: formatAmount(inst.amount),
          productName: contract.product.name,
          variantName: contract.variant?.sku,
          percentagePaid,
          payment_url: process.env.FRONTEND_URL,
          // Marketer fields — fall back gracefully if no marketer
          marketerEmail: marketer?.email ?? "",
          marketerName: marketer?.name ?? "N/A",
          marketerId: marketer?.userId ?? "",
        };

        await emitEvent(DomainEvent.INSTALLMENT_OVERDUE_3DAY, payload);
      } catch (err: any) {
        console.error(
          `❌ [InstallmentPaymentReminder] 3-day overdue failed for installment ${inst.installmentId}:`,
          err.message,
        );
      }
    }
  }

  private static async process7DayOverdue(now: Date): Promise<void> {
    const { start, end } = dayWindow(-7);

    const installments = await prisma.installment.findMany({
      where: {
        dueDate: { gte: start, lt: end },
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
      `🚨 [InstallmentPaymentReminder] 7-day overdue: ${installments.length} installment(s)`,
    );

    for (const inst of installments) {
      try {
        const contract = inst.financingContract;
        const customer = contract.user;

        const marketer = customer.referredByMarketerId
          ? await prisma.user.findUnique({
              where: {
                userId: customer.referredByMarketerId,
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
          customerEmail: customer.email,
          customerName: customer.name ?? "Customer",
          customerId: customer.userId,
          installmentId: inst.installmentId,
          sequence: inst.sequence,
          dueDate: formatDate(inst.dueDate),
          expectedPaymentDate: formatDate(inst.dueDate),
          amount: formatAmount(inst.amount),
          productName: contract.product.name,
          variantName: contract.variant?.sku,
          percentagePaid,
          payment_url: process.env.FRONTEND_URL,
          marketerEmail: marketer?.email ?? "",
          marketerName: marketer?.name ?? "N/A",
          marketerId: marketer?.userId ?? "",
          adminEmail: admin.email,
          adminName: admin.name ?? "Admin",
          adminId: admin.userId,
        };

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
