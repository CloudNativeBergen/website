'use client'

import { useState, ReactNode, ComponentType } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
  /** Optional leading icon shown next to the title (matches InfoCard chrome). */
  icon?: ComponentType<{ className?: string }>
  /**
   * Optional header affordance (e.g. an EditConferenceCard pencil) rendered to
   * the right, OUTSIDE the toggle button so it stays valid HTML and clickable
   * independently of expanding/collapsing.
   */
  action?: ReactNode
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  className = '',
  icon: Icon,
  action,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div
      className={`overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700 ${className}`}
    >
      <div className="flex items-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <span className="flex min-w-0 items-center">
            {Icon ? (
              <Icon className="mr-2 h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
            ) : null}
            <h2 className="truncate text-lg font-medium text-gray-900 dark:text-white">
              {title}
            </h2>
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {isOpen ? 'Hide' : 'Show'}
            </span>
            {isOpen ? (
              <ChevronDownIcon className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-gray-400" />
            )}
          </span>
        </button>
        {action ? (
          <div className="flex shrink-0 items-center gap-2 pr-4">{action}</div>
        ) : null}
      </div>

      {isOpen && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  )
}
