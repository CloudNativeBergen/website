'use client'

import { useState } from 'react'
import clsx from 'clsx'
import {
  ChevronDownIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'
import type { SponsorActivityExpanded } from '@/lib/sponsor-crm/types'
import { SponsorCommunicationRecord } from './SponsorCommunicationRecord'

/**
 * The compact feed line for a sent email (#1261): kind + recipients, the
 * subject underneath, and a chevron that expands the full record in place.
 * Keeps the timeline readable — the body never renders until asked for.
 */
export function SponsorCommunicationLine({
  activity,
  trailing,
  defaultExpanded = false,
}: {
  activity: SponsorActivityExpanded
  /** Avatar / timestamp cluster supplied by the host timeline. */
  trailing?: React.ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const failed = activity.deliveryStatus === 'failed'
  const Icon = failed ? ExclamationTriangleIcon : EnvelopeIcon

  return (
    <div className="py-1.5">
      <div className="group flex items-start gap-2.5">
        <div
          className={clsx(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
            failed
              ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',
          )}
        >
          <Icon className="h-3 w-3" />
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {activity.description}
          </p>
          {activity.subject && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {activity.subject}
            </p>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {trailing ?? (
            <time className="text-xs text-gray-400 dark:text-gray-500">
              {formatDistanceToNow(new Date(activity.createdAt), {
                addSuffix: true,
              })}
            </time>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Hide sent email' : 'Show sent email'}
            aria-expanded={expanded}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <ChevronDownIcon
              className={clsx(
                'h-4 w-4 transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </button>
        </div>
      </div>
      {expanded && <SponsorCommunicationRecord activity={activity} />}
    </div>
  )
}
