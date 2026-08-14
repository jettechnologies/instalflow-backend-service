import { z } from "zod";
import { ReminderOffsetOption } from "@/infrastructure/prisma";

export const UpdateReminderSettingsSchema = z.object({
  reminder3DayEnabled: z.boolean().optional(),
  reminder3DayOffset: z.nativeEnum(ReminderOffsetOption).optional(),
  reminder1DayEnabled: z.boolean().optional(),
  reminder1DayOffset: z.nativeEnum(ReminderOffsetOption).optional(),
  reminderDueTodayEnabled: z.boolean().optional(),
  reminderRecurringOverdueEnabled: z.boolean().optional(),
  reminderOverdue3DayEnabled: z.boolean().optional(),
  reminderOverdue3DayOffset: z.nativeEnum(ReminderOffsetOption).optional(),
  reminderOverdue7DayEnabled: z.boolean().optional(),
  reminderOverdue7DayOffset: z.nativeEnum(ReminderOffsetOption).optional(),
});
