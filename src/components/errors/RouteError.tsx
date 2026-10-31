'use client'

import { useEffect } from 'react'
import { Button } from '@/components/Button'

/**
 * Shared body for the route error boundaries (#825). Renders inside whatever
 * layout sits above the boundary, so it brings no chrome of its own.
 */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center px-6 py-20 text-center"
    >
      <p className="font-display text-2xl tracking-tight text-blue-900 dark:text-blue-100">
        Error
      </p>
      <h1 className="font-display mt-4 text-4xl font-medium tracking-tighter text-blue-600 sm:text-5xl dark:text-blue-300">
        Something went wrong
      </h1>
      <p className="mt-4 text-lg tracking-tight text-blue-900 dark:text-blue-100">
        This page could not be loaded. Please try again in a moment.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-sm text-gray-600 dark:text-gray-400">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-8 flex gap-4">
        <Button type="button" onClick={reset} variant="primary">
          Try again
        </Button>
        <Button href="/" variant="outline">
          Go back home
        </Button>
      </div>
    </div>
  )
}
