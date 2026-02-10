'use client'

import Link from 'next/link'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { type ReviewProgressData } from '@/lib/dashboard/data-types'
import { fetchReviewProgress } from '@/app/(admin)/admin/actions'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import {
  WidgetSkeleton,
  WidgetEmptyState,
  WidgetHeader,
  PhaseBadge,
} from './shared'

type ReviewProgressWidgetProps = BaseWidgetProps

export function ReviewProgressWidget({
  conference,
}: ReviewProgressWidgetProps) {
  const { data, loading } = useWidgetData<ReviewProgressData>(
    conference ? () => fetchReviewProgress(conference._id) : null,
    [conference],
  )
  const phase = conference ? getCurrentPhase(conference) : null

  if (loading) return <WidgetSkeleton />

  // Initialization phase: Setup guide
  if (phase === 'initialization') {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Review Progress"
          badge={<PhaseBadge label="Setup" variant="blue" />}
        />
        <div className="flex min-h-0 flex-1 flex-col justify-center space-y-3 overflow-y-auto text-sm text-gray-600 dark:text-gray-400">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-300">
              Prepare for CFP reviews by:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-blue-800 dark:text-blue-400">
              <li>• Setting review criteria and scoring rubric</li>
              <li>• Inviting reviewers and assigning permissions</li>
              <li>• Configuring blind review settings</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  // Post-conference phase: Final statistics
  if (phase === 'post-conference') {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Review Progress"
          badge={<PhaseBadge label="Complete" variant="green" />}
        />
        {data ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center space-y-3 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                  Total Reviewed
                </div>
                <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                  {data.reviewedCount}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                  Avg Score
                </div>
                <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                  {data.averageScore.toFixed(1)}
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    /10
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              <p className="text-xs text-green-800 dark:text-green-300">
                Review process completed for this conference
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            No review data available
          </div>
        )}
      </div>
    )
  }

  // Planning & Execution phases: Active review tracking
  if (!data) {
    return <WidgetEmptyState message="No review data available" />
  }

  const radius = 56
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset =
    circumference - (data.percentage / 100) * circumference

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 shrink-0 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Review Progress
      </h3>

      {/* Vertical layout by default, horizontal when wide enough */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden @[400px]:flex-row @[400px]:items-center @[400px]:justify-around">
        {/* Circle visualization */}
        <div className="relative flex shrink-0 items-center justify-center">
          <svg
            className="h-20 w-20 -rotate-90 transform @[200px]:h-24 @[200px]:w-24 @[280px]:h-28 @[280px]:w-28 @[350px]:h-32 @[350px]:w-32 @[450px]:h-36 @[450px]:w-36"
            viewBox="0 0 128 128"
          >
            <circle
              cx="64"
              cy="64"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              fill="transparent"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="64"
              cy="64"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="text-blue-600 transition-all duration-500 dark:text-blue-500"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-gray-900 @[200px]:text-xl @[280px]:text-2xl @[350px]:text-3xl dark:text-gray-100">
              {Math.round(data.percentage)}%
            </div>
            <div className="text-[10px] text-gray-500 @[200px]:text-[11px] @[280px]:text-xs dark:text-gray-400">
              {data.reviewedCount}/{data.totalProposals}
            </div>
          </div>
        </div>

        {/* Stats section - shows horizontally when widget is wide */}
        <div className="flex min-w-0 flex-col gap-2 text-center @[400px]:flex-1 @[400px]:text-left">
          {/* Average score */}
          <div>
            <div className="text-[10px] text-gray-500 @[200px]:text-xs dark:text-gray-400">
              Average Score
            </div>
            <div className="text-xl font-bold text-gray-900 @[280px]:text-2xl dark:text-gray-100">
              {data.averageScore.toFixed(1)}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                /10
              </span>
            </div>
          </div>

          {/* Additional stats when horizontal */}
          <div className="hidden grid-cols-2 gap-2 @[400px]:grid">
            <div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                Reviewed
              </div>
              <div className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">
                {data.reviewedCount}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                Remaining
              </div>
              <div className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">
                {data.totalProposals - data.reviewedCount}
              </div>
            </div>
          </div>

          {/* CTA button */}
          {data.nextUnreviewed && (
            <div className="@[400px]:mt-auto">
              <Link
                href={`/admin/proposals/${data.nextUnreviewed.id}`}
                className="block truncate rounded-lg bg-blue-50 px-3 py-1.5 text-center text-[10px] text-blue-700 transition-colors hover:bg-blue-100 @[250px]:text-xs dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                Review next →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
