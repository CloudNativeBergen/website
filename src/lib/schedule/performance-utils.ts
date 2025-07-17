/**
 * Performance utilities for drag operations
 */

import { DRAG_PERFORMANCE_THRESHOLD, BATCH_UPDATE_DELAY } from './types'

// Debounced drag update utility
export class DragPerformanceManager {
  private updateTimeout: NodeJS.Timeout | null = null
  private pendingUpdates: Array<() => void> = []

  /**
   * Schedule a drag update with performance optimization
   * Ensures updates don't happen more frequently than 60fps
   */
  scheduleDragUpdate(updateFn: () => void): void {
    this.pendingUpdates.push(updateFn)

    if (this.updateTimeout) {
      return // Already scheduled
    }

    this.updateTimeout = setTimeout(() => {
      const startTime = performance.now()

      // Execute all pending updates
      this.pendingUpdates.forEach((fn) => fn())
      this.pendingUpdates = []

      const duration = performance.now() - startTime

      // Warn if updates take longer than 60fps threshold
      if (duration > DRAG_PERFORMANCE_THRESHOLD) {
        console.warn(
          `Drag updates took ${duration.toFixed(2)}ms (threshold: ${DRAG_PERFORMANCE_THRESHOLD}ms)`,
        )
      }

      this.updateTimeout = null
    }, DRAG_PERFORMANCE_THRESHOLD)
  }

  /**
   * Cancel any pending drag updates
   */
  cancelPendingUpdates(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
      this.updateTimeout = null
    }
    this.pendingUpdates = []
  }
}

// Batch update utility for reducing re-renders
export class BatchUpdateManager {
  private updateTimeout: NodeJS.Timeout | null = null
  private pendingStateUpdates = new Set<() => void>()

  /**
   * Batch multiple state updates to reduce re-renders
   * Useful for rapid schedule modifications
   */
  batchUpdate(updateFn: () => void): void {
    this.pendingStateUpdates.add(updateFn)

    if (this.updateTimeout) {
      return // Already scheduled
    }

    this.updateTimeout = setTimeout(() => {
      const startTime = performance.now()

      // Execute all unique state updates
      this.pendingStateUpdates.forEach((fn) => fn())
      this.pendingStateUpdates.clear()

      const duration = performance.now() - startTime

      if (process.env.NODE_ENV === 'development') {
        console.log(`Batch update completed in ${duration.toFixed(2)}ms`)
      }

      this.updateTimeout = null
    }, BATCH_UPDATE_DELAY)
  }

  /**
   * Force immediate execution of pending updates
   */
  flushUpdates(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
      this.updateTimeout = null
    }

    this.pendingStateUpdates.forEach((fn) => fn())
    this.pendingStateUpdates.clear()
  }
}

// Singleton instances for global use
export const dragPerformanceManager = new DragPerformanceManager()
export const batchUpdateManager = new BatchUpdateManager()

// React hook for performance-optimized drag operations
export function useDragPerformance() {
  return {
    scheduleDragUpdate: (updateFn: () => void) =>
      dragPerformanceManager.scheduleDragUpdate(updateFn),
    cancelUpdates: () => dragPerformanceManager.cancelPendingUpdates(),
  }
}

// React hook for batched state updates
export function useBatchUpdates() {
  return {
    batchUpdate: (updateFn: () => void) =>
      batchUpdateManager.batchUpdate(updateFn),
    flushUpdates: () => batchUpdateManager.flushUpdates(),
  }
}
