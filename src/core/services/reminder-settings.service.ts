import { prisma, ReminderOffsetOption } from "@/infrastructure/prisma";
import { BadRequestError } from "@/shared/utils/AppError";
import { REMINDER_OFFSET_DAYS } from "@/shared/utils/helpers/reminder-offset";
import type { UpdateReminderSettingsSchema } from "@/shared/schemas/reminder-settings.schema";
import type z from "zod";

export interface EffectiveReminderSettings {
  reminder3DayEnabled: boolean;
  reminder3DayOffset: ReminderOffsetOption;
  reminder1DayEnabled: boolean;
  reminder1DayOffset: ReminderOffsetOption;
  reminderDueTodayEnabled: boolean;
  reminderRecurringOverdueEnabled: boolean;
  reminderOverdue3DayEnabled: boolean;
  reminderOverdue3DayOffset: ReminderOffsetOption;
  reminderOverdue7DayEnabled: boolean;
  reminderOverdue7DayOffset: ReminderOffsetOption;
}

// Defaults mirror the cadence PaymentReminderWorker hardcoded before this
// config existed — any company without a CompanyReminderSettings row behaves
// exactly as it always has.
export const DEFAULT_REMINDER_SETTINGS: EffectiveReminderSettings = {
  reminder3DayEnabled: true,
  reminder3DayOffset: ReminderOffsetOption.THREE_DAYS,
  reminder1DayEnabled: true,
  reminder1DayOffset: ReminderOffsetOption.TWO_DAYS,
  reminderDueTodayEnabled: true,
  reminderRecurringOverdueEnabled: true,
  reminderOverdue3DayEnabled: true,
  reminderOverdue3DayOffset: ReminderOffsetOption.THREE_DAYS,
  reminderOverdue7DayEnabled: true,
  reminderOverdue7DayOffset: ReminderOffsetOption.SEVEN_DAYS,
};

function assertOrdering(settings: EffectiveReminderSettings) {
  const primary = REMINDER_OFFSET_DAYS[settings.reminder3DayOffset];
  const secondary = REMINDER_OFFSET_DAYS[settings.reminder1DayOffset];
  if (secondary >= primary) {
    throw new BadRequestError(
      "reminder1DayOffset must be fewer days than reminder3DayOffset.",
    );
  }

  const overdueMarketer =
    REMINDER_OFFSET_DAYS[settings.reminderOverdue3DayOffset];
  const overdueAdmin = REMINDER_OFFSET_DAYS[settings.reminderOverdue7DayOffset];
  if (overdueMarketer > overdueAdmin) {
    throw new BadRequestError(
      "reminderOverdue3DayOffset must not be later than reminderOverdue7DayOffset.",
    );
  }
}

// Company-scoped installment reminder cadence overrides — see
// DOMAIN_MODEL.md "Reminders & Notifications". Does not own delivery
// mechanics (that's still PaymentReminderWorker/the notification-hub) or
// escalation targets (who gets notified stays fixed business logic).
export class ReminderSettingsService {
  static async getForCompany(
    companyId: string,
  ): Promise<EffectiveReminderSettings> {
    const row = await prisma.companyReminderSettings.findUnique({
      where: { companyId },
    });

    return row ? toEffectiveSettings(row) : DEFAULT_REMINDER_SETTINGS;
  }

  /** Bulk variant for the daily reminder scan — one query, not one per company. */
  static async getEffectiveSettingsMap(): Promise<
    Map<string, EffectiveReminderSettings>
  > {
    const rows = await prisma.companyReminderSettings.findMany();
    return new Map(rows.map((row) => [row.companyId, toEffectiveSettings(row)]));
  }

  static async updateForCompany(
    companyId: string,
    patch: z.infer<typeof UpdateReminderSettingsSchema>,
  ): Promise<EffectiveReminderSettings> {
    const existing = await this.getForCompany(companyId);
    const merged: EffectiveReminderSettings = { ...existing, ...patch };

    assertOrdering(merged);

    const row = await prisma.companyReminderSettings.upsert({
      where: { companyId },
      create: { companyId, ...merged },
      update: merged,
    });

    return toEffectiveSettings(row);
  }
}

function toEffectiveSettings(row: {
  reminder3DayEnabled: boolean;
  reminder3DayOffset: ReminderOffsetOption;
  reminder1DayEnabled: boolean;
  reminder1DayOffset: ReminderOffsetOption;
  reminderDueTodayEnabled: boolean;
  reminderRecurringOverdueEnabled: boolean;
  reminderOverdue3DayEnabled: boolean;
  reminderOverdue3DayOffset: ReminderOffsetOption;
  reminderOverdue7DayEnabled: boolean;
  reminderOverdue7DayOffset: ReminderOffsetOption;
}): EffectiveReminderSettings {
  return {
    reminder3DayEnabled: row.reminder3DayEnabled,
    reminder3DayOffset: row.reminder3DayOffset,
    reminder1DayEnabled: row.reminder1DayEnabled,
    reminder1DayOffset: row.reminder1DayOffset,
    reminderDueTodayEnabled: row.reminderDueTodayEnabled,
    reminderRecurringOverdueEnabled: row.reminderRecurringOverdueEnabled,
    reminderOverdue3DayEnabled: row.reminderOverdue3DayEnabled,
    reminderOverdue3DayOffset: row.reminderOverdue3DayOffset,
    reminderOverdue7DayEnabled: row.reminderOverdue7DayEnabled,
    reminderOverdue7DayOffset: row.reminderOverdue7DayOffset,
  };
}
