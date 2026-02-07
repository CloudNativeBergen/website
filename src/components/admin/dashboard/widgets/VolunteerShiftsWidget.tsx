'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  UserPlusIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import {
  getVolunteerShiftsData,
  type VolunteerShiftsData,
} from '@/hooks/dashboard/useDashboardData'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'

type VolunteerShiftsWidgetProps = BaseWidgetProps

export function VolunteerShiftsWidget({
  conference,
}: VolunteerShiftsWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const [data, setData] = useState<VolunteerShiftsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getVolunteerShiftsData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  // Phase-specific: Not execution phase - Show preparation message
  if (phase !== 'execution' && phase !== 'post-conference') {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <UserPlusIcon className="mb-3 h-12 w-12 text-gray-400" />
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Volunteer Shifts
        </h3>
        <p className="text-center text-xs text-gray-600 dark:text-gray-400">
          Shift scheduling becomes active during conference execution.
        </p>
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
          No volunteer data available
        </p>
      </div>
    )
  }

  // Execution/Post-conference phases
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Volunteer Shifts
        </h3>
        <Link
          href="/admin/volunteers"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Manage →
        </Link>
      </div>

      {data.openShifts > 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 p-2.5 text-center dark:bg-amber-900/20">
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            Open Shifts
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100">
            {data.openShifts}
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/20">
          <CheckCircleIcon className="mb-1 h-5 w-5 text-green-500" />
          <div className="text-[11px] text-green-600 dark:text-green-400">
            Filled
          </div>
          <div className="mt-0.5 text-lg font-bold text-green-900 dark:text-green-100">
            {data.filledShifts}/{data.totalShifts}
          </div>
        </div>
        <div className="rounded-lg bg-blue-50 p-2.5 dark:bg-blue-900/20">
          <UserPlusIcon className="mb-1 h-5 w-5 text-blue-500" />
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Volunteers
          </div>
          <div className="mt-0.5 text-lg font-bold text-blue-900 dark:text-blue-100">
            {data.totalVolunteers}
          </div>
        </div>
      </div>

      <div className="flex-1">
        <h4 className="mb-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          Shift Coverage
        </h4>
        <div className="space-y-2 [&>*:nth-child(n+4)]:hidden @[300px]:[&>*:nth-child(n+5)]:block @[300px]:[&>*:nth-child(n+6)]:hidden @[500px]:[&>*:nth-child(n+6)]:block">
          {data.shifts.map((shift) => {
            const fillColor =
              shift.fillRate === 100
                ? 'bg-green-600 dark:bg-green-500'
                : shift.fillRate >= 75
                  ? 'bg-blue-600 dark:bg-blue-500'
                  : 'bg-amber-600 dark:bg-amber-500'

            const needsAttention = shift.fillRate < 75

            return (
              <div
                key={shift.id}
                className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <h5 className="truncate text-[11px] leading-tight font-semibold text-gray-900 dark:text-gray-100">
                        {shift.name}
                      </h5>
                      {needsAttention && (
                        <ExclamationTriangleIcon className="h-3 w-3 shrink-0 text-amber-500" />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                      <ClockIcon className="h-3 w-3" />
                      <span className="truncate">{shift.time}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold text-gray-900 dark:text-gray-100">
                    {shift.volunteers}/{shift.needed}
                  </span>
                </div>

                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className={`h-full transition-all ${fillColor}`}
                    style={{ width: `${shift.fillRate}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
