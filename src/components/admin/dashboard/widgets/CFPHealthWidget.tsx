'use client'

import {
  DocumentTextIcon,
  ChartBarIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'

interface CFPHealthWidgetProps {
  data: {
    totalSubmissions: number
    submissionGoal: number
    submissionsPerDay: { date: string; count: number }[]
    formatDistribution: { format: string; count: number }[]
    daysRemaining: number
    averagePerDay: number
  }
}

export function CFPHealthWidget({ data }: CFPHealthWidgetProps) {
  if (!data || data.totalSubmissions === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No CFP data available
        </p>
      </div>
    )
  }

  const progress = (data.totalSubmissions / data.submissionGoal) * 100
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
      <div className="mb-4 grid grid-cols-3 gap-2 @[400px]:gap-3">
        {/* Total */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-blue-100 to-cyan-200 p-3 @[400px]:p-4 dark:from-blue-900/40 dark:to-cyan-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-blue-700 uppercase dark:text-blue-400">
              Total
            </div>
            <div className="mt-1 text-3xl font-black text-blue-900 @[400px]:text-4xl dark:text-blue-100">
              {data.totalSubmissions}
            </div>
            <div className="text-[10px] text-blue-600 dark:text-blue-300">
              of {data.submissionGoal} goal
            </div>
          </div>
          <DocumentTextIcon className="absolute -right-2 -bottom-2 h-16 w-16 text-blue-300/40 @[400px]:h-20 @[400px]:w-20 dark:text-blue-600/30" />
        </div>

        {/* Progress */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-green-100 to-emerald-200 p-3 @[400px]:p-4 dark:from-green-900/40 dark:to-emerald-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-green-700 uppercase dark:text-green-400">
              Progress
            </div>
            <div className="mt-1 text-3xl font-black text-green-900 @[400px]:text-4xl dark:text-green-100">
              {progress.toFixed(0)}%
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-green-300/50 dark:bg-green-900/50">
              <div
                className="h-full bg-green-600 transition-all duration-500 dark:bg-green-400"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
          <ChartBarIcon className="absolute -right-2 -bottom-2 h-16 w-16 text-green-300/40 @[400px]:h-20 @[400px]:w-20 dark:text-green-600/30" />
        </div>

        {/* Avg/Day */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-purple-100 to-pink-200 p-3 @[400px]:p-4 dark:from-purple-900/40 dark:to-pink-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-purple-700 uppercase dark:text-purple-400">
              Avg/Day
            </div>
            <div className="mt-1 text-3xl font-black text-purple-900 @[400px]:text-4xl dark:text-purple-100">
              {data.averagePerDay.toFixed(1)}
            </div>
          </div>
          <ClockIcon className="absolute -right-2 -bottom-2 h-16 w-16 text-purple-300/40 @[400px]:h-20 @[400px]:w-20 dark:text-purple-600/30" />
        </div>
      </div>

      {/* Minimal chart - Sparkline style */}
      <div className="mb-2">
        <h4 className="mb-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
          Submissions Trend
        </h4>
        <div className="flex h-8 items-end gap-0.5 @[400px]:h-10">
          {data.submissionsPerDay.map((day, index) => {
            const height = (day.count / maxSubmissions) * 100
            return (
              <div
                key={index}
                className="flex-1 rounded-t bg-blue-500 transition-all hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-300"
                style={{ height: `${height}%`, minHeight: '3px' }}
                title={`${day.date}: ${day.count}`}
              />
            )
          })}
        </div>
      </div>

      {/* Format Distribution - Compact bars */}
      <div className="min-h-0 flex-1">
        <h4 className="mb-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
          Format Distribution
        </h4>
        <div className="space-y-1.5">
          {data.formatDistribution.map((format) => {
            const percentage = (format.count / data.totalSubmissions) * 100
            return (
              <div key={format.format}>
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="text-[11px] text-gray-700 dark:text-gray-300">
                    {format.format}
                  </span>
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                    {format.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500 dark:bg-blue-400"
                    style={{ width: `${percentage}%` }}
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
