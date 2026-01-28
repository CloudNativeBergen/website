'use client'

import { Component, type ReactNode } from 'react'

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
          <svg
            className="mb-3 h-12 w-12 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
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
