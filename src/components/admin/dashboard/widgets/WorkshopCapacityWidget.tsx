'use client'

import {
  AcademicCapIcon,
  CalendarIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { type WorkshopCapacityData } from '@/lib/dashboard/data-types'
import { fetchWorkshopCapacity } from '@/app/(admin)/admin/actions'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import {
  WidgetSkeleton,
  WidgetEmptyState,
  WidgetHeader,
  PhaseBadge,
} from './shared'

type WorkshopCapacityWidgetProps = BaseWidgetProps

export function WorkshopCapacityWidget({
  conference,
}: WorkshopCapacityWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const { data, loading } = useWidgetData<WorkshopCapacityData>(
    conference ? () => fetchWorkshopCapacity(conference._id) : null,
    [conference],
  )

  // Phase-specific: Initialization/Planning - Show workshop planning
  if (
    (phase === 'initialization' || phase === 'planning') &&
    (!data || data.workshops.length === 0)
  ) {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Workshop Capacity"
          badge={<PhaseBadge label="Planning" variant="blue" />}
        />

        <div className="space-y-3">
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-700 dark:bg-purple-800/50">
            <AcademicCapIcon className="mb-2 h-8 w-8 text-purple-500" />
            <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
              Workshop Planning
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Select workshop proposals and configure capacity settings before
              opening registration.
            </p>
          </div>

          {conference && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Registration Opens
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <CalendarIcon className="h-4 w-4 text-gray-400" />
                <div className="text-sm font-bold text-gray-900 dark:text-white">
                  {conference.workshop_registration_start
                    ? new Date(
                      conference.workshop_registration_start,
                    ).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                    : 'Not set'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show completion summary
  if (phase === 'post-conference' && data) {
    const totalAttendees = data.workshops.reduce(
      (sum, w) => sum + w.confirmed,
      0,
    )
    const totalCapacity = data.workshops.reduce((sum, w) => sum + w.capacity, 0)

    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Workshop Capacity"
          badge={<PhaseBadge label="Complete" variant="green" />}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
            <CheckCircleIcon className="mb-2 h-6 w-6 text-purple-500" />
            <div className="text-[10px] font-medium text-purple-600 uppercase dark:text-purple-400">
              Workshops
            </div>
            <div className="mt-1 text-3xl font-bold text-purple-900 dark:text-purple-100">
              {data.workshops.length}
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <div className="text-[10px] font-medium text-blue-600 uppercase dark:text-blue-400">
              Attendees
            </div>
            <div className="mt-1 text-3xl font-bold text-blue-900 dark:text-blue-100">
              {totalAttendees}
            </div>
          </div>

          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <div className="text-[10px] font-medium text-green-600 uppercase dark:text-green-400">
              Avg Fill Rate
            </div>
            <div className="mt-1 text-3xl font-bold text-green-900 dark:text-green-100">
              {data.averageFillRate.toFixed(0)}%
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <div className="text-[10px] font-medium text-gray-600 uppercase dark:text-gray-400">
              Total Capacity
            </div>
            <div className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {totalCapacity}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return <WidgetSkeleton />
  }

  if (!data || data.workshops.length === 0) {
    return <WidgetEmptyState message="No workshop data available" />
  }

  // Default operational view (execution phase)

  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        title="Workshop Capacity"
        link={{ href: '/admin/workshops', label: 'Manage →' }}
      />

      <div className="@container:grid-cols-1 mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-blue-50 p-2 text-center dark:bg-blue-900/20">
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Avg Fill
          </div>
          <div className="mt-1 text-lg font-bold text-blue-900 dark:text-blue-100">
            {data.averageFillRate.toFixed(0)}%
          </div>
        </div>
        <div className="rounded-lg bg-green-50 p-2 text-center dark:bg-green-900/20">
          <div className="text-[11px] text-green-600 dark:text-green-400">
            Full
          </div>
          <div className="mt-1 text-lg font-bold text-green-900 dark:text-green-100">
            {data.atCapacity}
          </div>
        </div>
        <div className="rounded-lg bg-amber-50 p-2 text-center dark:bg-amber-900/20">
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            Waitlist
          </div>
          <div className="mt-1 text-lg font-bold text-amber-900 dark:text-amber-100">
            {data.totalWaitlist}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 [&>*:nth-child(n+4)]:hidden @[300px]:[&>*:nth-child(n+5)]:block @[300px]:[&>*:nth-child(n+6)]:hidden @[400px]:[&>*:nth-child(n+6)]:block @[600px]:[&>*:nth-child(n+7)]:block">
        {data.workshops.map((workshop) => {
          const fillColor =
            workshop.fillRate === 100
              ? 'bg-green-600 dark:bg-green-500'
              : workshop.fillRate >= 80
                ? 'bg-blue-600 dark:bg-blue-500'
                : workshop.fillRate >= 50
                  ? 'bg-amber-600 dark:bg-amber-500'
                  : 'bg-gray-600 dark:bg-gray-500'

          return (
            <div
              key={workshop.id}
              className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-1.5 flex items-start justify-between">
                <h4 className="flex-1 truncate text-[11px] leading-tight font-semibold text-gray-900 dark:text-gray-100">
                  {workshop.title}
                </h4>
                <span className="ml-2 text-[11px] font-bold text-gray-700 dark:text-gray-200">
                  {workshop.fillRate.toFixed(0)}%
                </span>
              </div>

              <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={`h-full transition-all ${fillColor}`}
                  style={{ width: `${workshop.fillRate}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                {/* Compact mode: just show ratio on small, full details on larger */}
                <span className="block @[250px]:hidden">
                  {workshop.confirmed}/{workshop.capacity}
                </span>
                <span className="hidden @[250px]:block">
                  {workshop.confirmed}/{workshop.capacity} confirmed
                </span>
                {workshop.waitlist > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {workshop.waitlist}
                    <span className="hidden @[250px]:inline"> waiting</span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
