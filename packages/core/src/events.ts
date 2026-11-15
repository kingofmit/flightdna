import type { FlightDNAEvent, FlightDNAEventMap } from "./types";

type Listener<T> = (data: T) => void;

/**
 * Type-safe event bus for FlightDNA events.
 */
export class EventBus {
  private listeners = new Map<FlightDNAEvent, Set<Listener<unknown>>>();

  /**
   * Subscribe to an event.
   */
  on<E extends FlightDNAEvent>(
    event: E,
    listener: Listener<FlightDNAEventMap[E]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as Listener<unknown>);

    // Return unsubscribe function
    return () => {
      set.delete(listener as Listener<unknown>);
    };
  }

  /**
   * Emit an event to all subscribers.
   */
  emit<E extends FlightDNAEvent>(
    event: E,
    data: FlightDNAEventMap[E],
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (err) {
          console.error(`[FlightDNA] Error in ${event} listener:`, err);
        }
      }
    }
  }

  /**
   * Remove all listeners for an event, or all listeners entirely.
   */
  off(event?: FlightDNAEvent): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event.
   */
  listenerCount(event: FlightDNAEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
