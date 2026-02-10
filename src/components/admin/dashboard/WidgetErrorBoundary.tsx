'use client'

import { Component, type ReactNode } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface WidgetErrorBoundaryProps {
  children: ReactNode
  widgetName: string
}

interface WidgetErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Widget error in ${this.props.widgetName}:`, error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-red-300 bg-red-50 p-6 text-center">
          <ExclamationTriangleIcon className="mb-3 h-12 w-12 text-red-400" />
          <h3 className="mb-1 text-sm font-semibold text-red-900">
            Widget Error
          </h3>
          <p className="text-xs text-red-700">
            {this.props.widgetName} failed to load
          </p>
          {this.state.error && (
            <p className="mt-2 text-xs text-red-600">
              {this.state.error.message}
            </p>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
