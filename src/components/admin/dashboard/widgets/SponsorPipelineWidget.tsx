'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CurrencyDollarIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { fetchSponsorPipelineData } from '@/app/(admin)/admin/actions'
import { type SponsorPipelineData } from '@/hooks/dashboard/useDashboardData'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'

type SponsorPipelineWidgetProps = BaseWidgetProps

export function SponsorPipelineWidget({
  conference,
}: SponsorPipelineWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const [data, setData] = useState<SponsorPipelineData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!conference) return
    fetchSponsorPipelineData(
      conference._id,
      conference.sponsor_revenue_goal || 0,
    ).then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [conference])

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  // Check if there's any pipeline activity at all
  const totalDeals = data?.stages.reduce((sum, s) => sum + s.count, 0) ?? 0

  // Phase-specific: Initialization/Planning with zero pipeline activity
  if (
    (phase === 'initialization' || phase === 'planning') &&
    (!data || totalDeals === 0)
  ) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Sponsor Pipeline
          </h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            Prospecting
          </span>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-700 dark:bg-green-800/50">
            <BuildingOffice2Icon className="mb-2 h-8 w-8 text-green-500" />
            <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
              Start Sponsorship Outreach
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Identify target sponsors, prepare packages, and begin outreach
              campaigns.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
              Revenue Goal
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <CurrencyDollarIcon className="h-4 w-4 text-gray-400" />
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {data && data.revenueGoal > 0
                  ? `${(data.revenueGoal / 1000).toFixed(0)}k`
                  : 'Not set'}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show final summary
  if (phase === 'post-conference' && data) {
    const finalRevenue = data.totalValue
    const goalAchieved =
      data.revenueGoal > 0 ? (finalRevenue / data.revenueGoal) * 100 : 0

    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Sponsor Pipeline
          </h3>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
            Complete
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <CheckCircleIcon className="mb-2 h-6 w-6 text-green-500" />
            <div className="text-[10px] font-medium text-green-600 uppercase dark:text-green-400">
              Total Revenue
            </div>
            <div className="mt-1 text-3xl font-bold text-green-900 dark:text-green-100">
              ${(finalRevenue / 1000).toFixed(0)}k
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <div className="text-[10px] font-medium text-blue-600 uppercase dark:text-blue-400">
              Goal Achieved
            </div>
            <div className="mt-1 text-3xl font-bold text-blue-900 dark:text-blue-100">
              {goalAchieved.toFixed(0)}%
            </div>
          </div>

          <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
            <div className="text-[10px] font-medium text-purple-600 uppercase dark:text-purple-400">
              Sponsors
            </div>
            <div className="mt-1 text-3xl font-bold text-purple-900 dark:text-purple-100">
              {data.wonDeals}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <div className="text-[10px] font-medium text-gray-600 uppercase dark:text-gray-400">
              Win Rate
            </div>
            <div className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {data.wonDeals + data.lostDeals > 0
                ? (
                    (data.wonDeals / (data.wonDeals + data.lostDeals)) *
                    100
                  ).toFixed(0)
                : 0}
              %
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No sponsor data available
        </p>
      </div>
    )
  }

  // Default operational view (execution phase)

  const progress =
    data.revenueGoal > 0 ? (data.totalValue / data.revenueGoal) * 100 : 0

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Sponsor Pipeline
        </h3>
        <Link
          href="/admin/sponsors/crm"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Manage pipeline →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 @[200px]:grid-cols-1 @[400px]:grid-cols-3">
        <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
          <div className="text-xs text-green-600 dark:text-green-400">
            Total Value
          </div>
          <div className="mt-1 text-xl font-bold text-green-900 dark:text-green-100">
            ${(data.totalValue / 1000).toFixed(0)}k
          </div>
          {data.revenueGoal > 0 && (
            <div className="mt-1 text-xs text-green-600 dark:text-green-400">
              of ${(data.revenueGoal / 1000).toFixed(0)}k
            </div>
          )}
        </div>
        <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
          <div className="text-xs text-blue-600 dark:text-blue-400">
            Won Deals
          </div>
          <div className="mt-1 text-xl font-bold text-blue-900 dark:text-blue-100">
            {data.wonDeals}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
          <div className="text-xs text-gray-600 dark:text-gray-300">
            Lost Deals
          </div>
          <div className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
            {data.lostDeals}
          </div>
        </div>
      </div>

      {data.revenueGoal > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
              Revenue Progress
            </h4>
            <span className="text-[11px] text-gray-600 dark:text-gray-300">
              {progress.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full bg-green-600 transition-all dark:bg-green-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="mb-3 shrink-0">
        <h4 className="mb-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          Pipeline Stages
        </h4>
        <div className="space-y-2">
          {data.stages.map((stage, index) => {
            const stageColors = [
              'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600',
              'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
              'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
              'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
            ]
            const color = stageColors[index] || stageColors[0]

            return (
              <div
                key={stage.name}
                className={`flex items-center justify-between rounded-lg border p-2.5 ${color}`}
              >
                <div>
                  <div className="text-xs leading-tight font-semibold">
                    {stage.name}
                  </div>
                  <div className="text-[10px] opacity-75">
                    {stage.count} deals
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold">
                    ${(stage.value / 1000).toFixed(0)}k
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
