'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClockIcon } from '@heroicons/react/24/outline'
import {
  getUpcomingDeadlines,
  type DeadlineData,
} from '@/hooks/dashboard/useDashboardData'

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

export function UpcomingDeadlinesWidget() {
  const [deadlines, setDeadlines] = useState<DeadlineData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUpcomingDeadlines().then((data) => {
      setDeadlines(data)
      setLoading(false)
    })
  }, [])

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
