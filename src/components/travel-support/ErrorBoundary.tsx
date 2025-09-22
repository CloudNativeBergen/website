import React, { Component, ReactNode } from 'react'
import { ErrorBoundaryFallback } from './ErrorComponents'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, retry: () => void) => ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      'Travel Support Error Boundary caught an error:',
      error,
      errorInfo,
    )

    this.props.onError?.(error, errorInfo)

    if (process.env.NODE_ENV === 'production') {
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry)
      }

      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          className="m-4"
        />
      )
    }

    return this.props.children
  }
}
