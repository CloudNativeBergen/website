'use client'

import Link from 'next/link'
import {
  CheckCircleIcon,
  ClockIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'

interface ProposalPipelineWidgetProps {
  data: {
    submitted: number
    accepted: number
    rejected: number
    confirmed: number
    total: number
    acceptanceRate: number
    pendingDecisions: number
  }
}

export function ProposalPipelineWidget({ data }: ProposalPipelineWidgetProps) {
  if (!data || data.total === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No proposal data available
        </p>
      </div>
    )
  }

  const acceptedPercentage = (data.accepted / data.total) * 100
  const rejectedPercentage = (data.rejected / data.total) * 100
  const confirmedPercentage = (data.confirmed / data.total) * 100

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Proposal Pipeline
        </h3>
        <Link
          href="/admin/proposals"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          View all →
        </Link>
      </div>

      {/* Main Stats - Redesigned as overlapping cards */}
      <div className="mb-4 grid grid-cols-3 gap-2 @[400px]:gap-3">
        {/* Total */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-gray-100 to-gray-200 p-3 @[400px]:p-4 dark:from-gray-800 dark:to-gray-700">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">
              Total
            </div>
            <div className="mt-1 text-3xl font-black text-gray-900 @[400px]:text-4xl dark:text-gray-100">
              {data.total}
            </div>
          </div>
          <PaperAirplaneIcon className="absolute -right-2 -bottom-2 h-16 w-16 text-gray-300/30 @[400px]:h-20 @[400px]:w-20 dark:text-gray-600/30" />
        </div>

        {/* Acceptance Rate */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-green-100 to-emerald-200 p-3 @[400px]:p-4 dark:from-green-900/40 dark:to-emerald-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-green-700 uppercase dark:text-green-400">
              Accept
            </div>
            <div className="mt-1 text-3xl font-black text-green-900 @[400px]:text-4xl dark:text-green-100">
              {data.acceptanceRate.toFixed(0)}%
            </div>
          </div>
          <CheckCircleIcon className="absolute -right-2 -bottom-2 h-16 w-16 text-green-300/40 @[400px]:h-20 @[400px]:w-20 dark:text-green-600/30" />
        </div>

        {/* Pending */}
        <div className="group relative overflow-hidden rounded-xl bg-linear-to-br from-amber-100 to-orange-200 p-3 @[400px]:p-4 dark:from-amber-900/40 dark:to-orange-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
              Pending
            </div>
            <div className="mt-1 text-3xl font-black text-amber-900 @[400px]:text-4xl dark:text-amber-100">
              {data.pendingDecisions}
            </div>
          </div>
          <ClockIcon className="absolute -right-2 -bottom-2 h-16 w-16 text-amber-300/40 @[400px]:h-20 @[400px]:w-20 dark:text-amber-600/30" />
        </div>
      </div>

      {/* Visual Pipeline - Two column layout when wide enough */}
      <div className="grid flex-1 grid-cols-1 gap-2 @[450px]:grid-cols-2 @[450px]:gap-3">
        {/* Submitted */}
        <div className="group">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" />
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                Submitted
              </span>
            </div>
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
              {data.submitted}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-gray-400 transition-all duration-500 dark:bg-gray-500"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Accepted */}
        <div className="group">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500 dark:bg-green-400" />
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                Accepted
              </span>
            </div>
            <span className="text-xs font-bold text-green-900 dark:text-green-100">
              {data.accepted}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500 dark:bg-green-400"
              style={{ width: `${acceptedPercentage}%` }}
            />
          </div>
        </div>

        {/* Rejected */}
        <div className="group">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500 dark:bg-red-400" />
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                Rejected
              </span>
            </div>
            <span className="text-xs font-bold text-red-900 dark:text-red-100">
              {data.rejected}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-red-500 transition-all duration-500 dark:bg-red-400"
              style={{ width: `${rejectedPercentage}%` }}
            />
          </div>
        </div>

        {/* Confirmed */}
        <div className="group">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                Confirmed
              </span>
            </div>
            <span className="text-xs font-bold text-blue-900 dark:text-blue-100">
              {data.confirmed}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500 dark:bg-blue-400"
              style={{ width: `${confirmedPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
