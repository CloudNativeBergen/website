'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDaysIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  MegaphoneIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import {
  getContentCalendarData,
  type ContentCalendarData,
} from '@/hooks/dashboard/useDashboardData'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'

const contentIcons = {
  blog: DocumentTextIcon,
  social: ChatBubbleLeftRightIcon,
  newsletter: EnvelopeIcon,
  announcement: MegaphoneIcon,
}

const statusColors = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  scheduled: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  published:
    'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
}

type ContentCalendarWidgetProps = BaseWidgetProps

export function ContentCalendarWidget({
  conference,
}: ContentCalendarWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const [data, setData] = useState<ContentCalendarData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getContentCalendarData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  // Phase-specific: Initialization - Show setup message
  if (phase === 'initialization') {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <CalendarDaysIcon className="mb-3 h-12 w-12 text-gray-400" />
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Content Calendar Setup
        </h3>
        <p className="text-center text-xs text-gray-600 dark:text-gray-400">
          Configure your content marketing strategy and publication schedule.
        </p>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show summary
  if (phase === 'post-conference' && data) {
    const totalContent =
      data.monthlyStats.published +
      data.monthlyStats.scheduled +
      data.monthlyStats.drafts

    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Content Calendar
          </h3>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
            Complete
          </span>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/20">
            <div className="text-[11px] text-green-600 dark:text-green-400">
              Published
            </div>
            <div className="mt-1 text-2xl font-bold text-green-900 dark:text-green-100">
              {data.monthlyStats.published}
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 p-2.5 dark:bg-blue-900/20">
            <div className="text-[11px] text-blue-600 dark:text-blue-400">
              Scheduled
            </div>
            <div className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
              {data.monthlyStats.scheduled}
            </div>
          </div>
          <div className="rounded-lg bg-purple-50 p-2.5 dark:bg-purple-900/20">
            <div className="text-[11px] text-purple-600 dark:text-purple-400">
              Total
            </div>
            <div className="mt-1 text-2xl font-bold text-purple-900 dark:text-purple-100">
              {totalContent}
            </div>
          </div>
        </div>

        <div className="flex-1">
          <h4 className="mb-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            Content Breakdown
          </h4>
          <div className="space-y-2">
            {data.contentTypes.map((type) => (
              <div
                key={type.type}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-2 dark:bg-gray-800"
              >
                <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  {type.type}
                </span>
                <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100">
                  {type.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No content calendar data available
        </p>
      </div>
    )
  }

  // Default operational view (planning/execution phases)
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Content Calendar
        </h3>
        <Link
          href="/admin/content"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Manage →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-green-50 p-2 text-center dark:bg-green-900/20">
          <div className="text-[11px] text-green-600 dark:text-green-400">
            Published
          </div>
          <div className="mt-1 text-lg font-bold text-green-900 dark:text-green-100">
            {data.monthlyStats.published}
          </div>
        </div>
        <div className="rounded-lg bg-blue-50 p-2 text-center dark:bg-blue-900/20">
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Scheduled
          </div>
          <div className="mt-1 text-lg font-bold text-blue-900 dark:text-blue-100">
            {data.monthlyStats.scheduled}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-800">
          <div className="text-[11px] text-gray-600 dark:text-gray-400">
            Drafts
          </div>
          <div className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
            {data.monthlyStats.drafts}
          </div>
        </div>
      </div>

      <div className="flex-1">
        <h4 className="mb-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          Upcoming Deadlines
        </h4>
        <div className="space-y-2 [&>*:nth-child(n+4)]:hidden @[500px]:[&>*:nth-child(n+5)]:block @[500px]:[&>*:nth-child(n+6)]:hidden @[700px]:[&>*:nth-child(n+6)]:block">
          {data.upcomingDeadlines.map((deadline) => {
            const Icon = contentIcons[deadline.type]
            const statusClass = statusColors[deadline.status]

            return (
              <div
                key={deadline.id}
                className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <h5 className="truncate text-[11px] leading-tight font-semibold text-gray-900 dark:text-gray-100">
                        {deadline.title}
                      </h5>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                        <ClockIcon className="h-3 w-3" />
                        <span>{deadline.daysRemaining}d remaining</span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`}
                  >
                    {deadline.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
