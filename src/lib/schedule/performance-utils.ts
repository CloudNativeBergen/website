import { DRAG_PERFORMANCE_THRESHOLD, BATCH_UPDATE_DELAY } from './types'

export class DragPerformanceManager {
  private updateTimeout: NodeJS.Timeout | null = null
  private pendingUpdates: Array<() => void> = []

  scheduleDragUpdate(updateFn: () => void): void {
    this.pendingUpdates.push(updateFn)

    if (this.updateTimeout) {
      return
    }

    this.updateTimeout = setTimeout(() => {
      const startTime = performance.now()

      this.pendingUpdates.forEach((fn) => fn())
      this.pendingUpdates = []

      const duration = performance.now() - startTime

      if (duration > DRAG_PERFORMANCE_THRESHOLD) {
        console.warn(
          `Drag updates took ${duration.toFixed(2)}ms (threshold: ${DRAG_PERFORMANCE_THRESHOLD}ms)`,
        )
      }

      this.updateTimeout = null
    }, DRAG_PERFORMANCE_THRESHOLD)
  }

  cancelPendingUpdates(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
      this.updateTimeout = null
    }
    this.pendingUpdates = []
  }
}

export class BatchUpdateManager {
  private updateTimeout: NodeJS.Timeout | null = null
  private pendingStateUpdates = new Set<() => void>()

  batchUpdate(updateFn: () => void): void {
    this.pendingStateUpdates.add(updateFn)

    if (this.updateTimeout) {
      return
    }

    this.updateTimeout = setTimeout(() => {
      const startTime = performance.now()

      this.pendingStateUpdates.forEach((fn) => fn())
      this.pendingStateUpdates.clear()

      const duration = performance.now() - startTime

      if (process.env.NODE_ENV === 'development') {
        console.log(`Batch update completed in ${duration.toFixed(2)}ms`)
      }

      this.updateTimeout = null
    }, BATCH_UPDATE_DELAY)
  }

  flushUpdates(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
      this.updateTimeout = null
    }

    this.pendingStateUpdates.forEach((fn) => fn())
    this.pendingStateUpdates.clear()
  }
}

export const dragPerformanceManager = new DragPerformanceManager()
export const batchUpdateManager = new BatchUpdateManager()

export function useDragPerformance() {
  return {
    scheduleDragUpdate: (updateFn: () => void) =>
      dragPerformanceManager.scheduleDragUpdate(updateFn),
    cancelUpdates: () => dragPerformanceManager.cancelPendingUpdates(),
  }
}

export function useBatchUpdates() {
  return {
    batchUpdate: (updateFn: () => void) =>
      batchUpdateManager.batchUpdate(updateFn),
    flushUpdates: () => batchUpdateManager.flushUpdates(),
  }
}
