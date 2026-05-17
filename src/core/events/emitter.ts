import { DomainEvent, DomainEventPayloads } from "./event.types";

type EventHandler<T extends DomainEvent> = (
  payload: DomainEventPayloads[T],
) => Promise<void>;

// ── Local in-process registry (still used for non-notification events) ────────
const handlers: Partial<Record<DomainEvent, EventHandler<any>[]>> = {};

export const onEvent = <T extends DomainEvent>(
  event: T,
  handler: EventHandler<T>,
) => {
  if (!handlers[event]) handlers[event] = [];
  handlers[event]!.push(handler);
};

export const removeEvent = <T extends DomainEvent>(
  event: T,
  handler: EventHandler<T>,
) => {
  if (!handlers[event]) return;
  handlers[event] = handlers[event]!.filter((h) => h !== handler);
};

export const removeAllEvents = (event: DomainEvent) => {
  delete handlers[event];
};

// ── Main emit: local handlers + remote notification hub ──────────────────────
export const emitEvent = async <T extends DomainEvent>(
  event: T,
  payload: DomainEventPayloads[T],
): Promise<void> => {
  // 1. Run any local in-process handlers (non-notification side-effects, etc.)
  const localHandlers = handlers[event] ?? [];
  if (localHandlers.length > 0) {
    await Promise.allSettled(localHandlers.map((h) => h(payload)));
  }

  // 2. Forward to Cloudflare notification hub (fire-and-forget with logging)
  await forwardToHub(event, payload);
};

// ── Cloudflare hub forwarder ─────────────────────────────────────────────────
async function forwardToHub(event: string, payload: any): Promise<void> {
  const hubUrl = process.env.NOTIFICATION_HUB_URL;

  if (!hubUrl) {
    console.warn(
      "[emitter] NOTIFICATION_HUB_URL not set — skipping hub dispatch",
    );
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(hubUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": process.env.NOTIFICATION_HUB_SECRET ?? "",
      },
      body: JSON.stringify({ event, payload }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[emitter] Hub rejected event=${event}: ${res.status} ${text}`,
      );
      return;
    }

    const result = await res.json();
    console.log(`[emitter] Hub accepted event=${event}`, result);
  } catch (err: any) {
    // Never let a notification failure crash the main request flow
    console.error(
      `[emitter] Hub dispatch failed for event=${event}:`,
      err?.message ?? err,
    );
  } finally {
    clearTimeout(timeout);
  }
}
