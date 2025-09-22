import React from 'react'

interface PerformanceMetrics {
  renderTime: number
  updateTime: number
  operationType: string
  componentName: string
}

class SchedulePerformanceMonitor {
  private metrics: PerformanceMetrics[] = []
  private timers = new Map<string, number>()

  startTimer(key: string): void {
    this.timers.set(key, performance.now())
  }

  endTimer(
    key: string,
    operationType: string,
    componentName: string,
  ): number | null {
    const startTime = this.timers.get(key)
    if (!startTime) return null

    const endTime = performance.now()
    const duration = endTime - startTime

    this.metrics.push({
      renderTime: duration,
      updateTime: duration,
      operationType,
      componentName,
    })

    this.timers.delete(key)

    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.warn(
        `Slow ${operationType} in ${componentName}: ${duration.toFixed(2)}ms`,
      )
    }

    return duration
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics]
  }

  clearMetrics(): void {
    this.metrics = []
  }

  getAverageTime(
    operationType?: string,
    componentName?: string,
  ): number | null {
    const filteredMetrics = this.metrics.filter(
      (metric) =>
        (!operationType || metric.operationType === operationType) &&
        (!componentName || metric.componentName === componentName),
    )

    if (filteredMetrics.length === 0) return null

    const totalTime = filteredMetrics.reduce(
      (sum, metric) => sum + metric.renderTime,
      0,
    )
    return totalTime / filteredMetrics.length
  }
}

export const performanceMonitor = new SchedulePerformanceMonitor()

export function usePerformanceTimer(
  componentName: string,
  operationType: string = 'render',
) {
  const timerKey = `${componentName}-${operationType}-${Date.now()}`

  return {
    start: () => performanceMonitor.startTimer(timerKey),
    end: () =>
      performanceMonitor.endTimer(timerKey, operationType, componentName),
  }
}

export function withPerformanceMonitoring<T extends object>(
  Component: React.ComponentType<T>,
  componentName: string,
) {
  return function PerformanceMonitoredComponent(props: T) {
    const timer = usePerformanceTimer(componentName)

    React.useEffect(() => {
      timer.start()
      return () => {
        timer.end()
      }
    })

    return React.createElement(Component, props)
  }
}
