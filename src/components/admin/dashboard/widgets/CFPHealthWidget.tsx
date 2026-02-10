'use client'

import { useState, useEffect } from 'react'
import {
  DocumentTextIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  CalendarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { fetchCFPHealth } from '@/app/(admin)/admin/actions'
import { CFPHealthData } from '@/hooks/dashboard/useDashboardData'

interface CFPHealthConfig {
  submissionTarget?: number
  showTrend?: boolean
  showFormatBreakdown?: boolean
}

type CFPHealthWidgetProps = BaseWidgetProps<CFPHealthConfig>

export function CFPHealthWidget({ conference, config }: CFPHealthWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const [now] = useState(() => Date.now())
  const [data, setData] = useState<CFPHealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!conference) return
    fetchCFPHealth(conference)
      .then((result) => {
        setData(result)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [conference])

  // Apply config defaults
  const submissionTarget = config?.submissionTarget ?? 100
  const showTrend = config?.showTrend ?? true
  const showFormatBreakdown = config?.showFormatBreakdown ?? true

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  // Phase-specific views
  if (phase === 'initialization' && conference) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            CFP Health
          </h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            Preparing
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <CalendarIcon className="mb-2 h-8 w-8 text-blue-500" />
            <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
              CFP Opens Soon
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Configure your CFP settings, topics, and formats before opening
              submissions.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Opens In
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {Math.ceil(
                  (new Date(conference.cfp_start_date).getTime() - now) /
                  (1000 * 60 * 60 * 24),
                )}
                d
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Duration
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {Math.ceil(
                  (new Date(conference.cfp_end_date).getTime() -
                    new Date(conference.cfp_start_date).getTime()) /
                  (1000 * 60 * 60 * 24),
                )}
                d
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'execution') {
    const totalSubs = data?.totalSubmissions ?? 0
    const goal = data?.submissionGoal || submissionTarget
    const acceptanceRate =
      totalSubs > 0 ? Math.round((goal / totalSubs) * 100) : 0

    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            CFP Health
          </h3>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
            Complete
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto">
          <div className="rounded-xl bg-linear-to-br from-blue-100 to-cyan-200 p-4 dark:from-blue-900/40 dark:to-cyan-800/40">
            <DocumentTextIcon className="mb-2 h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div className="text-3xl font-black text-blue-900 dark:text-blue-100">
              {totalSubs}
            </div>
            <div className="text-[10px] text-blue-700 dark:text-blue-300">
              Total Submissions
            </div>
          </div>

          <div className="rounded-xl bg-linear-to-br from-green-100 to-emerald-200 p-4 dark:from-green-900/40 dark:to-emerald-800/40">
            <CheckCircleIcon className="mb-2 h-6 w-6 text-green-600 dark:text-green-400" />
            <div className="text-3xl font-black text-green-900 dark:text-green-100">
              {data?.formatDistribution.reduce((sum, f) => sum + f.count, 0) ??
                0}
            </div>
            <div className="text-[10px] text-green-700 dark:text-green-300">
              Unique Formats
            </div>
          </div>

          <div className="rounded-xl bg-linear-to-br from-purple-100 to-pink-200 p-4 dark:from-purple-900/40 dark:to-pink-800/40">
            <UserGroupIcon className="mb-2 h-6 w-6 text-purple-600 dark:text-purple-400" />
            <div className="text-3xl font-black text-purple-900 dark:text-purple-100">
              {data?.averagePerDay.toFixed(1) ?? '0'}
            </div>
            <div className="text-[10px] text-purple-700 dark:text-purple-300">
              Avg / Day
            </div>
          </div>

          <div className="rounded-xl bg-linear-to-br from-amber-100 to-orange-200 p-4 dark:from-amber-900/40 dark:to-orange-800/40">
            <ChartBarIcon className="mb-2 h-6 w-6 text-amber-600 dark:text-amber-400" />
            <div className="text-3xl font-black text-amber-900 dark:text-amber-100">
              {goal > 0 ? Math.round((totalSubs / goal) * 100) : acceptanceRate}
              %
            </div>
            <div className="text-[10px] text-amber-700 dark:text-amber-300">
              Goal Progress
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'post-conference') {
    const totalSubs = data?.totalSubmissions ?? 0
    const goal = data?.submissionGoal || submissionTarget
    const goalPercent = goal > 0 ? Math.round((totalSubs / goal) * 100) : 0

    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            CFP Health
          </h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            Archived
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto">
          <div className="rounded-lg border border-gray-200 bg-linear-to-r from-blue-50 to-purple-50 p-4 dark:border-gray-700 dark:from-blue-900/20 dark:to-purple-900/20">
            <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
              CFP Performance
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {totalSubs}
                </div>
                <div className="text-[10px] text-gray-600 dark:text-gray-400">
                  Submissions
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {goalPercent}%
                </div>
                <div className="text-[10px] text-gray-600 dark:text-gray-400">
                  Goal Met
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {data?.averagePerDay.toFixed(1) ?? '0'}
                </div>
                <div className="text-[10px] text-gray-600 dark:text-gray-400">
                  Avg/Day
                </div>
              </div>
            </div>
          </div>

          <div className="text-center text-xs text-gray-500 dark:text-gray-400">
            View detailed analytics in Reports section
          </div>
        </div>
      </div>
    )
  }
  // Planning phase or when data is provided (backward compatibility)
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <div>
          <DocumentTextIcon className="mx-auto mb-2 h-12 w-12 text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No CFP data available
          </p>
          {config && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Target: {submissionTarget} submissions
            </p>
          )}
        </div>
      </div>
    )
  }

  if (data.totalSubmissions === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <div>
          <ClockIcon className="mx-auto mb-2 h-12 w-12 text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No submissions yet
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Goal: {data.submissionGoal || submissionTarget} submissions
          </p>
        </div>
      </div>
    )
  }

  // Use configured target or data target
  const effectiveGoal = data.submissionGoal || submissionTarget
  const progress = (data.totalSubmissions / effectiveGoal) * 100
  const maxSubmissions = Math.max(
    ...data.submissionsPerDay.map((d) => d.count),
    1,
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          CFP Health
        </h3>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {data.daysRemaining} days remaining
        </span>
      </div>

      {/* Main Stats - Gradient cards */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {/* Total */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-blue-100 to-cyan-200 p-2.5 dark:from-blue-900/40 dark:to-cyan-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-blue-700 uppercase dark:text-blue-400">
              Total
            </div>
            <div className="mt-1 text-3xl font-black text-blue-900 dark:text-blue-100">
              {data.totalSubmissions}
            </div>
            <div className="text-[10px] text-blue-600 dark:text-blue-300">
              of {effectiveGoal} goal
            </div>
          </div>
          <DocumentTextIcon className="absolute -right-2 -bottom-2 h-14 w-14 text-blue-300/40 dark:text-blue-600/30" />
        </div>

        {/* Progress */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-green-100 to-emerald-200 p-2.5 dark:from-green-900/40 dark:to-emerald-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-green-700 uppercase dark:text-green-400">
              Progress
            </div>
            <div className="mt-1 text-3xl font-black text-green-900 dark:text-green-100">
              {progress.toFixed(0)}%
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-green-300/50 dark:bg-green-900/50">
              <div
                className="h-full bg-green-600 transition-all duration-500 dark:bg-green-400"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
          <ChartBarIcon className="absolute -right-2 -bottom-2 h-14 w-14 text-green-300/40 dark:text-green-600/30" />
        </div>

        {/* Avg/Day */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-purple-100 to-pink-200 p-2.5 dark:from-purple-900/40 dark:to-pink-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-purple-700 uppercase dark:text-purple-400">
              Avg/Day
            </div>
            <div className="mt-1 text-3xl font-black text-purple-900 dark:text-purple-100">
              {data.averagePerDay.toFixed(1)}
            </div>
          </div>
          <ClockIcon className="absolute -right-2 -bottom-2 h-14 w-14 text-purple-300/40 dark:text-purple-600/30" />
        </div>
      </div>

      {/* Minimal chart - Sparkline style */}
      {showTrend && data.submissionsPerDay.length > 0 && (
        <div className="mb-2">
          <h4 className="mb-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
            Submissions Trend
          </h4>
          <div className="flex items-end gap-1">
            {data.submissionsPerDay.map((day, index) => {
              const height = (day.count / maxSubmissions) * 100
              const date = new Date(day.date + 'T00:00:00Z')
              const dateLabel = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })
              return (
                <div
                  key={index}
                  className="flex min-w-0 flex-1 flex-col items-center"
                  style={{ maxWidth: '4rem' }}
                >
                  <span className="mb-0.5 text-[9px] font-semibold text-gray-600 dark:text-gray-400">
                    {day.count}
                  </span>
                  <div className="flex h-8 w-full items-end">
                    <div
                      className="w-full rounded-t bg-blue-500 transition-all hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-300"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    />
                  </div>
                  <span className="mt-0.5 text-[8px] leading-tight text-gray-400 dark:text-gray-500">
                    {dateLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Format Distribution - Compact stacked bar + legend */}
      {showFormatBreakdown && data.formatDistribution.length > 0 && (
        <div className="min-h-0 flex-1">
          <h4 className="mb-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
            Format Distribution
          </h4>
          {/* Stacked horizontal bar */}
          <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            {data.formatDistribution.map((format, i) => {
              const percentage = (format.count / data.totalSubmissions) * 100
              const colors = [
                'bg-blue-500 dark:bg-blue-400',
                'bg-purple-500 dark:bg-purple-400',
                'bg-cyan-500 dark:bg-cyan-400',
                'bg-amber-500 dark:bg-amber-400',
                'bg-rose-500 dark:bg-rose-400',
                'bg-green-500 dark:bg-green-400',
              ]
              return (
                <div
                  key={format.format}
                  className={`h-full transition-all duration-500 ${colors[i % colors.length]}`}
                  style={{ width: `${percentage}%` }}
                  title={`${format.format}: ${format.count}`}
                />
              )
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {data.formatDistribution.map((format, i) => {
              const dotColors = [
                'bg-blue-500 dark:bg-blue-400',
                'bg-purple-500 dark:bg-purple-400',
                'bg-cyan-500 dark:bg-cyan-400',
                'bg-amber-500 dark:bg-amber-400',
                'bg-rose-500 dark:bg-rose-400',
                'bg-green-500 dark:bg-green-400',
              ]
              return (
                <div key={format.format} className="flex items-center gap-1">
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full ${dotColors[i % dotColors.length]}`}
                  />
                  <span className="text-[10px] text-gray-600 dark:text-gray-400">
                    {format.format}
                  </span>
                  <span className="text-[10px] font-bold text-gray-900 dark:text-gray-100">
                    {format.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
