'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CalendarIcon,
  CheckCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import {
  getScheduleStatusData,
  type ScheduleStatusData,
} from '@/hooks/dashboard/useDashboardData'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'

type ScheduleBuilderStatusWidgetProps = BaseWidgetProps

export function ScheduleBuilderStatusWidget({
  conference,
}: ScheduleBuilderStatusWidgetProps) {
  const [data, setData] = useState<ScheduleStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const phase = conference ? getCurrentPhase(conference) : null

  useEffect(() => {
    getScheduleStatusData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  // Initialization phase: Timeline planning guide
  if (phase === 'initialization') {
    return (
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Schedule Planning
          </h3>
        </div>
        <div className="flex flex-1 flex-col justify-center space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
            <p className="text-xs font-medium text-purple-900 dark:text-purple-300">
              Plan your conference schedule:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-purple-800 dark:text-purple-400">
              <li>• Define track structure and rooms</li>
              <li>• Set time slots and break times</li>
              <li>• Plan keynote and workshop sessions</li>
            </ul>
          </div>
          <Link
            href="/admin/schedule"
            className="block rounded-lg bg-purple-600 px-4 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
          >
            Configure Schedule
          </Link>
        </div>
      </div>
    )
  }

  // Post-conference phase: Archived schedule summary
  if (phase === 'post-conference') {
    if (!data || data.totalSlots === 0) {
      return (
        <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No schedule data available
          </p>
        </div>
      )
    }

    const overallProgress = (data.filledSlots / data.totalSlots) * 100

    return (
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Conference Schedule
          </h3>
        </div>
        <div className="flex flex-1 flex-col justify-center space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Total Sessions
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {data.filledSlots}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Completion
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {overallProgress.toFixed(0)}%
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
            <DocumentTextIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <p className="text-xs text-green-800 dark:text-green-300">
              View archived schedule and session recordings
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Planning & Execution phases: Active schedule building
  if (!data || data.totalSlots === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No schedule data available
        </p>
      </div>
    )
  }

  const overallProgress = (data.filledSlots / data.totalSlots) * 100

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Schedule Builder
        </h3>
        <Link
          href="/admin/schedule"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Build schedule →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-blue-50 p-2.5 dark:bg-blue-900/20">
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Slots Filled
          </div>
          <div className="mt-0.5 text-xl font-bold text-blue-900 dark:text-blue-100">
            {data.filledSlots}/{data.totalSlots}
          </div>
        </div>
        <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/20">
          <div className="text-[11px] text-green-600 dark:text-green-400">
            Progress
          </div>
          <div className="mt-0.5 text-xl font-bold text-green-900 dark:text-green-100">
            {overallProgress.toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            Overall
          </h4>
          <span className="text-[11px] text-gray-600 dark:text-gray-300">
            {overallProgress.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-blue-600 transition-all dark:bg-blue-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      <div className="flex-1 space-y-2">
        <h4 className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          By Day
        </h4>
        <div className="space-y-2 [&>*:nth-child(n+3)]:hidden @[300px]:[&>*:nth-child(n+4)]:block">
          {data.byDay.map((day) => {
            const dayProgress = (day.filled / day.total) * 100
            return (
              <div key={day.day}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    {day.day}
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {day.filled}/{day.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full bg-green-600 transition-all dark:bg-green-500"
                    style={{ width: `${dayProgress}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-3 flex gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        {data.unassignedConfirmedTalks > 0 && (
          <div className="flex-1 rounded-lg bg-amber-50 p-2 text-center dark:bg-amber-900/20">
            <div className="text-[11px] text-amber-600 dark:text-amber-400">
              Unassigned
            </div>
            <div className="mt-0.5 text-lg font-bold text-amber-900 dark:text-amber-100">
              {data.unassignedConfirmedTalks}
            </div>
          </div>
        )}
        {data.placeholderSlots > 0 && (
          <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-800">
            <div className="text-[11px] text-gray-600 dark:text-gray-300">
              Placeholders
            </div>
            <div className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100">
              {data.placeholderSlots}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
