'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ClockIcon,
  CheckCircleIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'
import {
  fetchDeadlines,
} from '@/app/(admin)/admin/actions'
import {
  type DeadlineData,
} from '@/hooks/dashboard/useDashboardData'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'

const urgencyStyles = {
  high: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
  medium:
    'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  low: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
}

const urgencyBadgeStyles = {
  high: 'bg-red-600 dark:bg-red-500 text-white',
  medium: 'bg-amber-600 dark:bg-amber-500 text-white',
  low: 'bg-blue-600 dark:bg-blue-500 text-white',
}

type UpcomingDeadlinesWidgetProps = BaseWidgetProps

export function UpcomingDeadlinesWidget({
  conference,
}: UpcomingDeadlinesWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const [deadlines, setDeadlines] = useState<DeadlineData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!conference) return
    fetchDeadlines(conference).then((data) => {
      setDeadlines(data)
      setLoading(false)
    })
  }, [conference])

  // Phase-specific: Initialization without deadlines - Show planning timeline
  if (phase === 'initialization' && conference) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Upcoming Deadlines
          </h3>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
            Planning
          </span>
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-800/50">
            <CalendarIcon className="mb-2 h-6 w-6 text-blue-500" />
            <h4 className="text-xs font-semibold text-gray-900 dark:text-white">
              Set Key Dates
            </h4>
            <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
              Configure CFP, speaker notifications, and program publication
              deadlines.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show completion summary
  if (phase === 'post-conference') {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <CheckCircleIcon className="mb-3 h-12 w-12 text-green-500" />
        <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
          All Deadlines Met
        </h3>
        <p className="text-center text-xs text-gray-600 dark:text-gray-400">
          Conference complete. Great work!
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  if (!deadlines || deadlines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No upcoming deadlines
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Upcoming Deadlines
      </h3>

      {/* Vertical layout on narrow/tall containers, horizontal on wide containers */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden @[500px]:grid @[500px]:auto-cols-fr @[500px]:grid-flow-col">
        {deadlines.slice(0, 3).map((deadline) => {
          const urgencyClass = urgencyStyles[deadline.urgency]
          const badgeClass = urgencyBadgeStyles[deadline.urgency]

          return (
            <div
              key={deadline.name}
              className={`flex min-w-0 flex-col justify-between rounded-lg border p-2.5 ${urgencyClass}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs leading-tight font-semibold">
                    {deadline.name}
                  </h4>
                  <p className="truncate text-[10px] opacity-75">
                    {deadline.phase}
                  </p>
                </div>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${badgeClass}`}
                >
                  {deadline.daysRemaining}d
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                {/* Always show compact date */}
                <div className="flex items-center gap-1 text-[10px] opacity-75">
                  <ClockIcon className="h-3 w-3" />
                  <span>
                    {new Date(deadline.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                {/* Show action link when there's enough horizontal space */}
                {deadline.action && deadline.actionLink && (
                  <Link
                    href={deadline.actionLink}
                    className="hidden text-[10px] font-medium underline hover:no-underline @[400px]:inline-flex"
                  >
                    {deadline.action} →
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
