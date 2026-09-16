'use client'

import Link from 'next/link'
import { fetchMarketingDue } from '@/lib/dashboard/fetchers'
import type { MarketingDueData } from '@/lib/dashboard/data-types'
import type { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import { formatConferenceDateShort } from '@/lib/time'
import {
  WidgetSkeleton,
  WidgetErrorState,
  WidgetEmptyState,
  WidgetHeader,
  WidgetBody,
} from './shared'

export function MarketingDueWidget({ conference }: BaseWidgetProps) {
  const { data, loading, error, refetch } = useWidgetData<MarketingDueData>(
    conference ? () => fetchMarketingDue() : null,
    [conference?._id],
  )

  return (
    <div className="flex h-full min-w-0 flex-col">
      <WidgetHeader
        title="Marketing due"
        link={{ href: '/admin/marketing', label: 'View plan' }}
      />
      {loading ? (
        <WidgetSkeleton />
      ) : error ? (
        <WidgetErrorState onRetry={refetch} />
      ) : !data?.tasks.length ? (
        <WidgetEmptyState message="No marketing tasks due" />
      ) : (
        <WidgetBody className="flex flex-col gap-1.5">
          {data.tasks.map((task) => (
            <Link
              key={task.id}
              href={task.href}
              className="block min-w-0 rounded-lg border border-gray-200 px-2.5 py-2 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-700 dark:hover:bg-gray-700"
            >
              <p
                className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100"
                title={task.title}
              >
                {task.title}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px]">
                <span
                  className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-400"
                  title={task.assigneeName}
                >
                  {task.assigneeName}
                </span>
                <span
                  className={
                    task.overdue
                      ? 'shrink-0 text-red-700 dark:text-red-400'
                      : 'shrink-0 text-blue-700 dark:text-blue-400'
                  }
                >
                  {task.overdue
                    ? `Overdue · ${formatConferenceDateShort(task.dueAt)}`
                    : 'Due today'}
                </span>
              </div>
            </Link>
          ))}
        </WidgetBody>
      )}
    </div>
  )
}
