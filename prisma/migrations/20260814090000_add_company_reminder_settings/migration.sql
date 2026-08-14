-- CreateEnum
CREATE TYPE "ReminderOffsetOption" AS ENUM ('TWO_DAYS', 'THREE_DAYS', 'SEVEN_DAYS');

-- CreateTable
CREATE TABLE "CompanyReminderSettings" (
    "id" BIGSERIAL NOT NULL,
    "settingsId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reminder3DayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder3DayOffset" "ReminderOffsetOption" NOT NULL DEFAULT 'THREE_DAYS',
    "reminder1DayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder1DayOffset" "ReminderOffsetOption" NOT NULL DEFAULT 'TWO_DAYS',
    "reminderDueTodayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderRecurringOverdueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderOverdue3DayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderOverdue3DayOffset" "ReminderOffsetOption" NOT NULL DEFAULT 'THREE_DAYS',
    "reminderOverdue7DayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderOverdue7DayOffset" "ReminderOffsetOption" NOT NULL DEFAULT 'SEVEN_DAYS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyReminderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyReminderSettings_settingsId_key" ON "CompanyReminderSettings"("settingsId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyReminderSettings_companyId_key" ON "CompanyReminderSettings"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyReminderSettings" ADD CONSTRAINT "CompanyReminderSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("companyId") ON DELETE CASCADE ON UPDATE CASCADE;
