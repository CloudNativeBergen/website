'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getReviewProgressData,
  type ReviewProgressData,
} from '@/hooks/dashboard/useDashboardData'

export function ReviewProgressWidget() {
  const [data, setData] = useState<ReviewProgressData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getReviewProgressData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No review data available
        </p>
      </div>
    )
  }

  const radius = 56
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset =
    circumference - (data.percentage / 100) * circumference

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Review Progress
      </h3>

      {/* Vertical layout by default, horizontal when wide enough */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 @[400px]:flex-row @[400px]:items-center @[400px]:justify-around">
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
        <div className="flex flex-col gap-2 text-center @[400px]:flex-1 @[400px]:text-left">
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
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {data.reviewedCount}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                Remaining
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {data.totalProposals - data.reviewedCount}
              </div>
            </div>
          </div>

          {/* CTA button */}
          {data.nextUnreviewed && (
            <div className="@[400px]:mt-auto">
              <Link
                href={`/admin/proposals/${data.nextUnreviewed.id}`}
                className="block rounded-lg bg-blue-50 px-3 py-1.5 text-center text-[10px] text-blue-700 transition-colors hover:bg-blue-100 @[250px]:text-xs dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
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
