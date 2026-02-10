'use client'

import Link from 'next/link'
import { CheckCircleIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { fetchDeadlines } from '@/app/(admin)/admin/actions'
import { type DeadlineData } from '@/lib/dashboard/data-types'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import {
  WidgetSkeleton,
  WidgetEmptyState,
  WidgetErrorState,
  WidgetHeader,
  PhaseBadge,
} from './shared'

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

function formatDaysRemaining(days: number): string {
  if (days <= 6) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  return `${Math.floor(days / 30)}m`
}

interface UpcomingDeadlinesConfig {
  urgentThreshold?: number
  maxDeadlines?: number
}

type UpcomingDeadlinesWidgetProps = BaseWidgetProps<UpcomingDeadlinesConfig>

export function UpcomingDeadlinesWidget({
  conference,
  config,
}: UpcomingDeadlinesWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const {
    data: deadlines,
    loading,
    error,
    refetch,
  } = useWidgetData<DeadlineData[]>(
    conference ? () => fetchDeadlines(conference) : null,
    [conference],
  )

  // Phase-specific: Initialization without deadlines - Show planning timeline
  if (phase === 'initialization' && conference) {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Upcoming Deadlines"
          badge={<PhaseBadge label="Planning" variant="blue" />}
        />

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

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetErrorState onRetry={refetch} />
  if (!deadlines || deadlines.length === 0) {
    return <WidgetEmptyState message="No upcoming deadlines" />
  }

  const maxDeadlines = config?.maxDeadlines ?? 5

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Upcoming Deadlines
      </h3>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {deadlines.slice(0, maxDeadlines).map((deadline) => {
          const urgencyClass = urgencyStyles[deadline.urgency]
          const badgeClass = urgencyBadgeStyles[deadline.urgency]

          return (
            <div
              key={deadline.name}
              className={`flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${urgencyClass}`}
            >
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-[11px] leading-tight font-semibold">
                  {deadline.name}
                </h4>
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[10px] opacity-75">
                    {deadline.phase}
                  </span>
                  <span className="text-[10px] opacity-60">&middot;</span>
                  <span className="text-[10px] opacity-75">
                    {new Date(deadline.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  {deadline.action && deadline.actionLink && (
                    <Link
                      href={deadline.actionLink}
                      className="ml-auto text-[10px] font-medium underline hover:no-underline"
                    >
                      {deadline.action} &rarr;
                    </Link>
                  )}
                </div>
              </div>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${badgeClass}`}
              >
                {formatDaysRemaining(deadline.daysRemaining)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
