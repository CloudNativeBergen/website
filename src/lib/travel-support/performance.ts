/**
 * Performance monitoring utilities for travel support components
 */

import React from 'react'

interface PerformanceMetric {
  name: string
  duration: number
  timestamp: number
  metadata?: Record<string, any>
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private observers: PerformanceObserver[] = []

  constructor() {
    if (typeof window !== 'undefined' && 'performance' in window) {
      this.setupObservers()
    }
  }

  private setupObservers() {
    // Monitor Long Tasks (tasks that block the main thread for >50ms)
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this.recordMetric({
              name: 'long-task',
              duration: entry.duration,
              timestamp: entry.startTime,
              metadata: {
                type: 'performance',
                entryType: entry.entryType,
              },
            })
          })
        })
        longTaskObserver.observe({ entryTypes: ['longtask'] })
        this.observers.push(longTaskObserver)
      } catch (e) {
        console.warn('Long task observer not supported:', e)
      }

      // Monitor Layout Shifts
      try {
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry: any) => {
            if (entry.hadRecentInput) return // Ignore shifts caused by user input

            this.recordMetric({
              name: 'layout-shift',
              duration: entry.value,
              timestamp: entry.startTime,
              metadata: {
                type: 'cls',
                sources: entry.sources?.map((source: any) => ({
                  node: source.node?.tagName,
                  currentRect: source.currentRect,
                  previousRect: source.previousRect,
                })),
              },
            })
          })
        })
        clsObserver.observe({ entryTypes: ['layout-shift'] })
        this.observers.push(clsObserver)
      } catch (e) {
        console.warn('Layout shift observer not supported:', e)
      }
    }
  }

  recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric)

    // Keep only last 100 metrics to prevent memory leaks
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-50)
    }

    // Log significant performance issues in development
    if (process.env.NODE_ENV === 'development') {
      if (metric.name === 'long-task' && metric.duration > 100) {
        console.warn(`Long task detected: ${metric.duration}ms`)
      }
      if (metric.name === 'layout-shift' && metric.duration > 0.1) {
        console.warn(`Layout shift detected: ${metric.duration}`)
      }
    }
  }

  /**
   * Time a function execution
   */
  timeFunction<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>,
  ): T {
    const startTime = performance.now()
    const result = fn()
    const endTime = performance.now()

    this.recordMetric({
      name,
      duration: endTime - startTime,
      timestamp: startTime,
      metadata,
    })

    return result
  }

  /**
   * Time an async function execution
   */
  async timeAsyncFunction<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>,
  ): Promise<T> {
    const startTime = performance.now()
    const result = await fn()
    const endTime = performance.now()

    this.recordMetric({
      name,
      duration: endTime - startTime,
      timestamp: startTime,
      metadata,
    })

    return result
  }

  /**
   * Mark the start of a measurement
   */
  markStart(name: string) {
    if (typeof window !== 'undefined' && 'performance' in window) {
      performance.mark(`${name}-start`)
    }
  }

  /**
   * Mark the end of a measurement and record metric
   */
  markEnd(name: string, metadata?: Record<string, any>) {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const endMarkName = `${name}-end`
      const measureName = `${name}-measure`

      performance.mark(endMarkName)
      performance.measure(measureName, `${name}-start`, endMarkName)

      const measure = performance.getEntriesByName(measureName)[0]
      if (measure) {
        this.recordMetric({
          name,
          duration: measure.duration,
          timestamp: measure.startTime,
          metadata,
        })
      }

      // Clean up marks and measures
      performance.clearMarks(`${name}-start`)
      performance.clearMarks(endMarkName)
      performance.clearMeasures(measureName)
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics]
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter((metric) => metric.name === name)
  }

  /**
   * Get average duration for a metric
   */
  getAverageDuration(name: string): number {
    const metrics = this.getMetricsByName(name)
    if (metrics.length === 0) return 0

    const total = metrics.reduce((sum, metric) => sum + metric.duration, 0)
    return total / metrics.length
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics = []
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const summary: Record<string, any> = {}
    const metricNames = [...new Set(this.metrics.map((m) => m.name))]

    metricNames.forEach((name) => {
      const metrics = this.getMetricsByName(name)
      summary[name] = {
        count: metrics.length,
        average: this.getAverageDuration(name),
        min: Math.min(...metrics.map((m) => m.duration)),
        max: Math.max(...metrics.map((m) => m.duration)),
      }
    })

    return summary
  }

  /**
   * Cleanup observers
   */
  disconnect() {
    this.observers.forEach((observer) => observer.disconnect())
    this.observers = []
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor()

// React hook for performance monitoring
export function usePerformanceMonitor() {
  return {
    timeFunction: performanceMonitor.timeFunction.bind(performanceMonitor),
    timeAsyncFunction:
      performanceMonitor.timeAsyncFunction.bind(performanceMonitor),
    markStart: performanceMonitor.markStart.bind(performanceMonitor),
    markEnd: performanceMonitor.markEnd.bind(performanceMonitor),
    recordMetric: performanceMonitor.recordMetric.bind(performanceMonitor),
    getMetrics: performanceMonitor.getMetrics.bind(performanceMonitor),
    getSummary: performanceMonitor.getSummary.bind(performanceMonitor),
  }
}

// Higher-order component for monitoring component render performance
export function withPerformanceMonitoring<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string,
) {
  const name =
    componentName || Component.displayName || Component.name || 'Component'

  const WrappedComponent = (props: P) => {
    const { timeFunction } = usePerformanceMonitor()

    return timeFunction(
      `${name}-render`,
      () => React.createElement(Component, props),
      { component: name },
    )
  }

  WrappedComponent.displayName = `withPerformanceMonitoring(${name})`

  return WrappedComponent
}

// Utility for bundle size analysis in development
export function analyzeBundleSize() {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    // Log component tree size
    const getComponentSize = (element: Element): number => {
      let size = element.outerHTML.length
      Array.from(element.children).forEach((child) => {
        size += getComponentSize(child)
      })
      return size
    }

    const travelSupportElements = document.querySelectorAll(
      '[data-component*="travel-support"]',
    )
    let totalSize = 0

    travelSupportElements.forEach((element) => {
      const size = getComponentSize(element)
      totalSize += size
      console.log(
        `Component size: ${element.getAttribute('data-component')} - ${size} bytes`,
      )
    })

    console.log(`Total travel support DOM size: ${totalSize} bytes`)
  }
}

export default performanceMonitor
