import { ReminderOffsetOption } from "@/infrastructure/prisma";

/** Maps a CompanyReminderSettings offset enum value to its day-count magnitude. */
export const REMINDER_OFFSET_DAYS: Record<ReminderOffsetOption, number> = {
  [ReminderOffsetOption.TWO_DAYS]: 2,
  [ReminderOffsetOption.THREE_DAYS]: 3,
  [ReminderOffsetOption.SEVEN_DAYS]: 7,
};

export const MAX_REMINDER_OFFSET_DAYS = 7;
