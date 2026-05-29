// import { DomainEvent, DomainEventPayloads } from "./event.types";

// type EventHandler<T extends DomainEvent> = (
//   payload: DomainEventPayloads[T],
// ) => Promise<void>;

// const handlers: Partial<Record<DomainEvent, EventHandler<any>[]>> = {};

// export const onEvent = <T extends DomainEvent>(
//   event: T,
//   handler: EventHandler<T>,
// ) => {
//   if (!handlers[event]) handlers[event] = [];
//   handlers[event]!.push(handler);
// };

// export const emitEvent = async <T extends DomainEvent>(
//   event: T,
//   payload: DomainEventPayloads[T],
// ) => {
//   const eventHandlers = handlers[event] || [];

//   await Promise.allSettled(eventHandlers.map((handler) => handler(payload)));
// };

// export const removeEvent = <T extends DomainEvent>(
//   event: T,
//   handler: EventHandler<T>,
// ) => {
//   if (!handlers[event]) return;
//   handlers[event] = handlers[event]!.filter((h) => h !== handler);
// };

// export const removeAllEvents = (event: DomainEvent) => {
//   if (!handlers[event]) return;
//   delete handlers[event];
// };
