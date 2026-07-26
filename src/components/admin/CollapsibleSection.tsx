'use client'

import { useId, useState, ReactNode } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
  /**
   * Rendered icon ELEMENT (not a component function): this is a client
   * component, and server callers can only pass serializable props — a
   * ReactNode element crosses the RSC boundary; a component function throws.
   */
  icon?: ReactNode
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
  icon,
  action,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <div
      className={`overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700 ${className}`}
    >
      <div className="flex items-center">
        {/* Accessible-disclosure pattern: the HEADING wraps the toggle button
            (h2 > button is valid; button/span > h2 is not — a heading is flow
            content and cannot sit inside phrasing content). */}
        <h2 className="flex min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-controls={contentId}
            className="flex min-w-0 flex-1 items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="flex min-w-0 items-center">
              {icon ? (
                <span className="mr-2 shrink-0 text-gray-400 dark:text-gray-500 [&>svg]:h-5 [&>svg]:w-5">
                  {icon}
                </span>
              ) : null}
              <span className="truncate text-lg font-medium text-gray-900 dark:text-white">
                {title}
              </span>
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
        </h2>
        {action ? (
          <div className="flex shrink-0 items-center gap-2 pr-4">{action}</div>
        ) : null}
      </div>

      {isOpen && (
        <div
          id={contentId}
          className="border-t border-gray-200 dark:border-gray-700"
        >
          {children}
        </div>
      )}
    </div>
  )
}
