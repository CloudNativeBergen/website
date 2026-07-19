'use client'

import Link from 'next/link'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { type MyAreasData } from '@/lib/dashboard/data-types'
import { WidgetEmptyState, WidgetHeader } from './shared'

/**
 * Presentational body of the "My areas" widget (TEAMS-3, L4). Pure over
 * {@link MyAreasData} — free of the server action — so it renders in Storybook
 * and tests directly. Empty `areas` is the inert state (viewer on no team).
 */
export function MyAreasView({ data }: { data: MyAreasData | null }) {
  if (!data || data.areas.length === 0) {
    return (
      <WidgetEmptyState
        message="You're not on any team yet. Team areas show up here once you're a member."
        icon={<UserGroupIcon className="h-8 w-8 text-gray-300" />}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <WidgetHeader title="My Areas" />
      <div className="grid grid-cols-1 gap-2 @[300px]:grid-cols-2">
        {data.areas.map((area) => (
          <div
            key={area.key}
            className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-2 flex items-center gap-1.5">
              <UserGroupIcon className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
              <h4 className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">
                {area.title}
              </h4>
            </div>
            {area.metrics.length === 0 ? (
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Nothing to action
              </p>
            ) : (
              <ul className="space-y-1">
                {area.metrics.map((metric) => (
                  <li key={metric.label}>
                    <Link
                      href={metric.href}
                      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <span className="truncate text-[11px] text-gray-600 dark:text-gray-300">
                        {metric.label}
                      </span>
                      <span
                        className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                          metric.count > 0
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                            : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                        }`}
                      >
                        {metric.count > 99 ? '99+' : metric.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
