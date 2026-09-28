import type { EventEnvelope } from "@pcc/contracts";

type EventListener = (event: EventEnvelope) => void;

export class EventBroker {
  private readonly listeners = new Set<EventListener>();

  publish(event: EventEnvelope) {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: EventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
