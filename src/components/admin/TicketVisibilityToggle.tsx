/**
 * Ticket visibility toggle control component
 * Used to switch between paid-only and all tickets view
 */

'use client'

import { Switch } from '@headlessui/react'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

interface TicketVisibilityToggleProps {
  includeFreeTickets: boolean
  onToggle: (include: boolean) => void
  paidCount: number
  freeCount: number
  className?: string
}

export function TicketVisibilityToggle({
  includeFreeTickets,
  onToggle,
  paidCount,
  freeCount,
  className = '',
}: TicketVisibilityToggleProps) {
  const totalCount = paidCount + freeCount
  const currentCount = includeFreeTickets ? totalCount : paidCount
  const toggleId = 'ticket-visibility-toggle'

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-white/50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50 ${className}`}
    >
      <div className="flex items-center gap-2">
        {includeFreeTickets ? (
          <EyeIcon
            className="h-4 w-4 text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          />
        ) : (
          <EyeSlashIcon
            className="h-4 w-4 text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          />
        )}
        <div className="text-right">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Current View
          </div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {currentCount} {includeFreeTickets ? 'total' : 'paid'} tickets
          </div>
          {includeFreeTickets && freeCount > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              ({paidCount} paid + {freeCount} free)
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <label
          htmlFor={toggleId}
          className="sr-only text-xs text-gray-500 dark:text-gray-400"
        >
          Include free tickets in analysis
        </label>
        <Switch
          id={toggleId}
          checked={includeFreeTickets}
          onChange={onToggle}
          className={`${
            includeFreeTickets
              ? 'bg-blue-600 dark:bg-blue-500'
              : 'bg-gray-200 dark:bg-gray-700'
          } relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-gray-900`}
          aria-describedby={`${toggleId}-description`}
        >
          <span className="sr-only">
            {includeFreeTickets ? 'Hide' : 'Show'} free tickets
          </span>
          <span
            className={`${
              includeFreeTickets ? 'translate-x-5' : 'translate-x-1'
            } inline-block h-3 w-3 transform rounded-full bg-white transition-transform`}
          />
        </Switch>
        <p id={`${toggleId}-description`} className="sr-only">
          Toggle to {includeFreeTickets ? 'exclude' : 'include'} speaker tickets
          and other complimentary tickets in charts and statistics
        </p>
      </div>
    </div>
  )
}
