'use client'

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
            {includeFreeTickets ? 'All Tickets View' : 'Paid Tickets Only'}
          </div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {currentCount} {includeFreeTickets ? 'total' : 'paid'} tickets
          </div>
          <div className="min-h-[1rem] text-xs text-gray-500 dark:text-gray-400">
            {includeFreeTickets && freeCount > 0 ? (
              <>
                ({paidCount} paid + {freeCount} free)
              </>
            ) : (
              <>&nbsp;</>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <label
          htmlFor={toggleId}
          className="sr-only text-xs text-gray-500 dark:text-gray-400"
        >
          Include free tickets in analysis
        </label>
        <div className="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-300 outline-offset-2 outline-indigo-500 transition-colors duration-200 ease-in-out has-checked:bg-indigo-500 has-focus-visible:outline-2 dark:bg-gray-700 dark:inset-ring-gray-600 dark:has-checked:bg-indigo-400">
          <span className="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5 dark:bg-gray-100 dark:ring-gray-800/20" />
          <input
            id={toggleId}
            name="include-free-tickets"
            type="checkbox"
            checked={includeFreeTickets}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label="Include free tickets in analysis"
            aria-describedby={`${toggleId}-description`}
            className="absolute inset-0 appearance-none focus:outline-hidden"
          />
        </div>
        <p id={`${toggleId}-description`} className="sr-only">
          Toggle to {includeFreeTickets ? 'exclude' : 'include'} speaker tickets
          and other complimentary tickets in charts and statistics
        </p>
      </div>
    </div>
  )
}
