import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { ErrorDisplayProps } from './utils'

/**
 * Reusable error display component for admin pages
 * Provides consistent error messaging across the admin interface
 */
export function ErrorDisplay({
  title,
  message,
  backLink = { href: '/admin', label: 'Back to Dashboard' },
  homeLink = true
}: ErrorDisplayProps) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-24 sm:py-32 lg:px-8">
      <div className="text-center">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 text-base leading-7 text-gray-600 max-w-lg">
          {message || 'An unexpected error occurred. Please try again later.'}
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link
            href={backLink.href}
            className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {backLink.label}
          </Link>
          {homeLink && (
            <Link
              href="/"
              className="text-sm font-semibold text-gray-900 hover:text-gray-700"
            >
              Go home <span aria-hidden="true">&rarr;</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
