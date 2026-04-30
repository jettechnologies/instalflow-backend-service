// src/events/emitter.ts
type EventHandler = (payload: any) => Promise<void>;

const handlers: Record<string, EventHandler[]> = {};

export const onEvent = (event: string, handler: EventHandler) => {
  if (!handlers[event]) handlers[event] = [];
  handlers[event].push(handler);
};

export const emitEvent = async (event: string, payload: any) => {
  const eventHandlers = handlers[event] || [];

  await Promise.allSettled(eventHandlers.map((handler) => handler(payload)));
};

export const removeEvent = (event: string, handler: EventHandler) => {
  if (!handlers[event]) return;
  handlers[event] = handlers[event].filter((h) => h !== handler);
};

export const removeAllEvents = (event: string) => {
  if (!handlers[event]) return;
  delete handlers[event];
};
