import { ProposalStatusChangeEvent } from './types'

type EventHandlerFunction = (event: ProposalStatusChangeEvent) => Promise<void>

/**
 * In-memory event bus implementation
 * For production, consider using Redis Pub/Sub, AWS EventBridge, or similar
 */
class InMemoryEventBus {
  private handlers: Map<string, Set<EventHandlerFunction>> = new Map()

  subscribe(eventType: string, handler: EventHandlerFunction): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    const eventHandlers = this.handlers.get(eventType)
    if (eventHandlers) {
      eventHandlers.add(handler)
    }
  }

  unsubscribe(eventType: string, handler: EventHandlerFunction): void {
    const eventHandlers = this.handlers.get(eventType)
    if (eventHandlers) {
      eventHandlers.delete(handler)
      if (eventHandlers.size === 0) {
        this.handlers.delete(eventType)
      }
    }
  }

  async publish(event: ProposalStatusChangeEvent): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventType)
    if (!eventHandlers || eventHandlers.size === 0) {
      return
    }

    // Execute all handlers in parallel
    const handlerPromises = Array.from(eventHandlers).map(async (handler) => {
      try {
        await handler(event)
      } catch (error) {
        // Log error but don't fail other handlers
        console.error(`Event handler failed for ${event.eventType}:`, error)
      }
    })

    // Wait for all handlers to complete
    await Promise.allSettled(handlerPromises)
  }
}

// Singleton instance
export const eventBus = new InMemoryEventBus()
