import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface ErrorDisplayProps {
  title?: string
  message: string
  onDismiss?: () => void
  variant?: 'error' | 'warning'
  className?: string
}

interface ErrorBoundaryFallbackProps {
  error: Error
  onRetry?: () => void
  className?: string
}

export function ErrorDisplay({
  title = 'Error',
  message,
  onDismiss,
  variant = 'error',
  className = '',
}: ErrorDisplayProps) {
  const variantClasses = {
    error: {
      container:
        'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/50',
      icon: 'text-red-400 dark:text-red-500',
      title: 'text-red-800 dark:text-red-300',
      message: 'text-red-700 dark:text-red-400',
      dismiss:
        'text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400',
    },
    warning: {
      container:
        'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/50',
      icon: 'text-amber-400 dark:text-amber-500',
      title: 'text-amber-800 dark:text-amber-300',
      message: 'text-amber-700 dark:text-amber-400',
      dismiss:
        'text-amber-400 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-400',
    },
  }

  const classes = variantClasses[variant]

  return (
    <div className={`rounded-md border p-4 ${classes.container} ${className}`}>
      <div className="flex">
        <div className="shrink-0">
          <ExclamationTriangleIcon className={`h-5 w-5 ${classes.icon}`} />
        </div>
        <div className="ml-3 flex-1">
          <h3 className={`text-sm font-medium ${classes.title}`}>{title}</h3>
          <p className={`mt-1 text-sm ${classes.message}`}>{message}</p>
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                type="button"
                onClick={onDismiss}
                className={`inline-flex rounded-md p-1.5 focus:ring-2 focus:ring-offset-2 focus:outline-none ${classes.dismiss}`}
              >
                <span className="sr-only">Dismiss</span>
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ErrorBoundaryFallback({
  error,
  onRetry,
  className = '',
}: ErrorBoundaryFallbackProps) {
  return (
    <div
      className={`rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-900/10 ${className}`}
    >
      <div className="flex">
        <div className="shrink-0">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-400 dark:text-red-500" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
            Something went wrong
          </h3>
          <div className="mt-2 text-sm text-red-700 dark:text-red-400">
            <p>An unexpected error occurred while loading this section.</p>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">
                  Error details (development only)
                </summary>
                <pre className="mt-2 text-xs whitespace-pre-wrap">
                  {error.message}
                  {error.stack && `\n${error.stack}`}
                </pre>
              </details>
            )}
          </div>
          {onRetry && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/75"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function NetworkErrorDisplay({
  onRetry,
  className = '',
}: {
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-900/10 ${className}`}
    >
      <div className="flex">
        <div className="shrink-0">
          <ExclamationTriangleIcon className="h-6 w-6 text-amber-400 dark:text-amber-500" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Connection Error
          </h3>
          <div className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            <p>
              Unable to connect to the server. Please check your internet
              connection and try again.
            </p>
          </div>
          {onRetry && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/75"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ValidationErrorSummary({
  errors,
  className = '',
}: {
  errors: Record<string, string>
  className?: string
}) {
  const errorCount = Object.keys(errors).length

  if (errorCount === 0) return null

  return (
    <ErrorDisplay
      title={`${errorCount} validation error${errorCount > 1 ? 's' : ''}`}
      message="Please fix the errors below and try again."
      variant="error"
      className={className}
    />
  )
}
