import React from 'react'
import { BellIcon } from '@heroicons/react/24/outline'

export interface LocalhostWarningProps {
  /**
   * The target audience that cannot access localhost URLs
   * @example "speakers", "sponsors", "attendees"
   */
  audience: string
}

/**
 * Creates a localhost warning component to display when running in development mode.
 * Shows a warning that email notifications will contain invalid localhost URLs.
 *
 * @param audience - The target audience (e.g., "speakers", "sponsors")
 * @returns JSX element or undefined if not on localhost
 */
export function createLocalhostWarning(
  domain: string | undefined,
  audience: string,
): React.JSX.Element | undefined {
  if (!domain || !domain.includes('localhost')) {
    return undefined
  }

  return (
    <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/30">
      <div className="flex">
        <div className="flex-shrink-0">
          <BellIcon
            className="h-5 w-5 text-yellow-400 dark:text-yellow-300"
            aria-hidden="true"
          />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Development Environment Warning
          </h3>
          <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
            <p>
              You are running on localhost. Email notifications will contain
              invalid links pointing to localhost URLs that {audience} cannot
              access.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook to check if currently running on localhost
 */
export function useIsLocalhost(domain?: string): boolean {
  return Boolean(domain?.includes('localhost'))
}
