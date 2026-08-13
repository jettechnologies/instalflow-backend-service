import { redis } from "@/infrastructure/redis/redis-connect";

const REMINDER_TTL_SECONDS = 24 * 60 * 60;

/** UTC [start, end) window for "today + offsetDays" — offsetDays may be negative. */
export function dayWindow(offsetDays: number): { start: Date; end: Date } {
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

function reminderKey(entityId: string, type: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `reminder:sent:${entityId}:${type}:${day}`;
}

/** Redis SET NX idempotency guard — true the first time a reminder type fires for an entity today. */
export async function ensureReminderSent(
  entityId: string,
  type: string,
): Promise<boolean> {
  const key = reminderKey(entityId, type);
  const result = await redis.set(key, "1", "EX", REMINDER_TTL_SECONDS, "NX");
  return result === "OK";
}
