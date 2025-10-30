import { EventTypeMap, DomainEvent } from './types'

type EventHandlerFunction<T extends DomainEvent = DomainEvent> = (
  event: T,
) => Promise<void>

class InMemoryEventBus {
  private handlers: Map<
    keyof EventTypeMap,
    Set<EventHandlerFunction<DomainEvent>>
  > = new Map()

  subscribe<K extends keyof EventTypeMap>(
    eventType: K,
    handler: EventHandlerFunction<EventTypeMap[K]>,
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    const eventHandlers = this.handlers.get(eventType)
    if (eventHandlers) {
      eventHandlers.add(handler as EventHandlerFunction<DomainEvent>)
    }
  }

  unsubscribe<K extends keyof EventTypeMap>(
    eventType: K,
    handler: EventHandlerFunction<EventTypeMap[K]>,
  ): void {
    const eventHandlers = this.handlers.get(eventType)
    if (eventHandlers) {
      eventHandlers.delete(handler as EventHandlerFunction<DomainEvent>)
      if (eventHandlers.size === 0) {
        this.handlers.delete(eventType)
      }
    }
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventType)
    if (!eventHandlers || eventHandlers.size === 0) {
      return
    }

    const handlerPromises = Array.from(eventHandlers).map(async (handler) => {
      try {
        await handler(event)
      } catch (error) {
        console.error(`Event handler failed for ${event.eventType}:`, error)
      }
    })

    await Promise.allSettled(handlerPromises)
  }
}

export const eventBus = new InMemoryEventBus()

// Export types for use in other modules
export type { EventHandlerFunction, DomainEvent }
