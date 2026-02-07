'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CurrencyDollarIcon,
  GlobeAltIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import {
  getTravelSupportData,
  type TravelSupportData,
} from '@/hooks/dashboard/useDashboardData'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'

type TravelSupportQueueWidgetProps = BaseWidgetProps

export function TravelSupportQueueWidget({
  conference,
}: TravelSupportQueueWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const [data, setData] = useState<TravelSupportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTravelSupportData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  // Phase-specific: Initialization/Planning - Show setup guidance
  if (
    (phase === 'initialization' || phase === 'planning') &&
    (!data || data.totalRequested === 0)
  ) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Travel Support
          </h3>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
            Planning
          </span>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-700 dark:bg-cyan-800/50">
            <GlobeAltIcon className="mb-2 h-8 w-8 text-cyan-500" />
            <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
              Travel Support Program
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Set budget allocation and configure travel support policies for
              speakers.
            </p>
          </div>

          {data && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Budget Allocated
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <CurrencyDollarIcon className="h-4 w-4 text-gray-400" />
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(data.budgetAllocated / 1000).toFixed(0)}k
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show final summary
  if (phase === 'post-conference' && data) {
    const budgetUsed = (data.totalApproved / data.budgetAllocated) * 100

    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Travel Support
          </h3>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
            Complete
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <CheckCircleIcon className="mb-2 h-6 w-6 text-green-500" />
            <div className="text-[10px] font-medium text-green-600 uppercase dark:text-green-400">
              Total Approved
            </div>
            <div className="mt-1 text-3xl font-bold text-green-900 dark:text-green-100">
              ${(data.totalApproved / 1000).toFixed(0)}k
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <div className="text-[10px] font-medium text-blue-600 uppercase dark:text-blue-400">
              Budget Used
            </div>
            <div className="mt-1 text-3xl font-bold text-blue-900 dark:text-blue-100">
              {budgetUsed.toFixed(0)}%
            </div>
          </div>

          <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
            <div className="text-[10px] font-medium text-purple-600 uppercase dark:text-purple-400">
              Speakers Supported
            </div>
            <div className="mt-1 text-3xl font-bold text-purple-900 dark:text-purple-100">
              {data.requests.length}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <div className="text-[10px] font-medium text-gray-600 uppercase dark:text-gray-400">
              Avg per Speaker
            </div>
            <div className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
              $
              {data.requests.length > 0
                ? Math.round(data.totalApproved / data.requests.length)
                : 0}
            </div>
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
          No travel support data available
        </p>
      </div>
    )
  }

  // Default operational view (execution phase)

  const budgetUsed = (data.totalApproved / data.budgetAllocated) * 100

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Travel Support
        </h3>
        <Link
          href="/admin/travel-support"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Review →
        </Link>
      </div>

      {data.pendingApprovals > 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 p-2.5 text-center dark:bg-amber-900/20">
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            Pending Approvals
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100">
            {data.pendingApprovals}
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/20">
          <div className="text-[11px] text-green-600 dark:text-green-400">
            Approved
          </div>
          <div className="mt-1 text-lg font-bold text-green-900 dark:text-green-100">
            ${(data.totalApproved / 1000).toFixed(1)}k
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800">
          <div className="text-[11px] text-gray-600 dark:text-gray-300">
            Requested
          </div>
          <div className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
            ${(data.totalRequested / 1000).toFixed(1)}k
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            Budget Usage
          </h4>
          <span className="text-[11px] text-gray-600 dark:text-gray-300">
            ${(data.budgetAllocated / 1000).toFixed(0)}k total
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full transition-all ${
              budgetUsed > 90
                ? 'bg-red-600 dark:bg-red-500'
                : budgetUsed > 70
                  ? 'bg-amber-600 dark:bg-amber-500'
                  : 'bg-green-600 dark:bg-green-500'
            }`}
            style={{ width: `${Math.min(budgetUsed, 100)}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-300">
          {budgetUsed.toFixed(0)}% used
        </div>
      </div>

      {data.requests.length > 0 && (
        <div className="flex-1">
          <h4 className="mb-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            Pending Requests
          </h4>
          <div className="space-y-2 [&>*:nth-child(n+3)]:hidden @[300px]:[&>*:nth-child(n+4)]:block @[300px]:[&>*:nth-child(n+5)]:hidden @[500px]:[&>*:nth-child(n+5)]:block">
            {data.requests.map((request) => (
              <Link
                key={request.id}
                href={`/admin/travel-support/${request.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-2.5 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
              >
                <div className="mb-0.5 flex items-start justify-between">
                  <span className="text-[11px] leading-tight font-semibold text-gray-900 dark:text-gray-100">
                    {request.speaker}
                  </span>
                  <span className="ml-2 flex items-center gap-0.5 text-[11px] font-bold text-gray-900 dark:text-gray-100">
                    <CurrencyDollarIcon className="h-3 w-3" />
                    {request.amount.toLocaleString()}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                  Submitted {request.submittedAt}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.requests.length === 0 && data.pendingApprovals === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-800">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            No pending requests
          </p>
        </div>
      )}
    </div>
  )
}
