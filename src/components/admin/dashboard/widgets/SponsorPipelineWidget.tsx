'use client'

import {
  BanknotesIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  TrophyIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { SponsorLogo } from '@/components/SponsorLogo'
import { fetchSponsorPipelineData } from '@/app/(admin)/admin/actions'
import { type SponsorPipelineWidgetData } from '@/lib/dashboard/data-types'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import {
  WidgetSkeleton,
  WidgetEmptyState,
  WidgetErrorState,
  WidgetHeader,
  PhaseBadge,
  ProgressBar,
} from './shared'

interface SponsorPipelineConfig {
  revenueTarget?: number
  showPipeline?: boolean
  showContractStatus?: boolean
}

type SponsorPipelineWidgetProps = BaseWidgetProps<SponsorPipelineConfig>

export function SponsorPipelineWidget({
  conference,
  config,
}: SponsorPipelineWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const { data, loading, error, refetch } =
    useWidgetData<SponsorPipelineWidgetData>(
      conference
        ? () =>
            fetchSponsorPipelineData(
              conference._id,
              conference.sponsor_revenue_goal || 0,
            )
        : null,
      [conference],
    )

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetErrorState onRetry={refetch} />

  // Check if there's any pipeline activity at all
  const totalDeals = data?.stages.reduce((sum, s) => sum + s.count, 0) ?? 0

  // Phase-specific: Initialization/Planning with zero pipeline activity
  if (
    (phase === 'initialization' || phase === 'planning') &&
    (!data || totalDeals === 0)
  ) {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Sponsor Pipeline"
          badge={<PhaseBadge label="Prospecting" variant="amber" />}
        />

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
              <BanknotesIcon className="h-4 w-4 text-gray-400" />
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
        <WidgetHeader
          title="Sponsor Pipeline"
          badge={<PhaseBadge label="Complete" variant="green" />}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <CheckCircleIcon className="mb-2 h-6 w-6 text-green-500" />
            <div className="text-[10px] font-medium text-green-600 uppercase dark:text-green-400">
              Total Revenue
            </div>
            <div className="mt-1 text-3xl font-bold text-green-900 dark:text-green-100">
              kr {(finalRevenue / 1000).toFixed(0)}k
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
    return <WidgetEmptyState message="No sponsor data available" />
  }

  // Default operational view (execution phase)

  const progress =
    data.revenueGoal > 0 ? (data.totalValue / data.revenueGoal) * 100 : 0

  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        title="Sponsor Pipeline"
        link={{ href: '/admin/sponsors/crm', label: 'Manage pipeline →' }}
      />

      <div className="mb-3 grid grid-cols-3 gap-2 @[200px]:grid-cols-1 @[400px]:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-green-100 to-emerald-200 p-2.5 dark:from-green-900/40 dark:to-emerald-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-green-700 uppercase dark:text-green-400">
              Total Value
            </div>
            <div className="mt-1 text-xl font-bold text-green-900 dark:text-green-100">
              kr {(data.totalValue / 1000).toFixed(0)}k
            </div>
            {data.revenueGoal > 0 && (
              <div className="text-[10px] text-green-600 dark:text-green-300">
                of kr {(data.revenueGoal / 1000).toFixed(0)}k
              </div>
            )}
          </div>
          <BanknotesIcon className="absolute -right-2 -bottom-2 h-14 w-14 text-green-300/40 dark:text-green-600/30" />
        </div>
        <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-blue-100 to-cyan-200 p-2.5 dark:from-blue-900/40 dark:to-cyan-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-blue-700 uppercase dark:text-blue-400">
              Won Deals
            </div>
            <div className="mt-1 text-xl font-bold text-blue-900 dark:text-blue-100">
              {data.wonDeals}
            </div>
          </div>
          <TrophyIcon className="absolute -right-2 -bottom-2 h-14 w-14 text-blue-300/40 dark:text-blue-600/30" />
        </div>
        <div className="relative overflow-hidden rounded-xl border border-red-200 bg-linear-to-br from-red-100 to-rose-200 p-2.5 dark:border-red-800 dark:from-red-900/40 dark:to-rose-800/40">
          <div className="relative z-10">
            <div className="text-[10px] font-medium tracking-wide text-red-700 uppercase dark:text-red-400">
              Lost Deals
            </div>
            <div className="mt-1 text-xl font-bold text-red-900 dark:text-red-100">
              {data.lostDeals}
            </div>
          </div>
          <XCircleIcon className="absolute -right-2 -bottom-2 h-14 w-14 text-red-300/40 dark:text-red-600/30" />
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
            <ProgressBar
              value={progress}
              color="bg-green-600 dark:bg-green-500"
            />
          </div>
        </div>
      )}

      {(config?.showPipeline ?? true) && (
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
                  className={`flex items-center gap-2 rounded-lg border p-2.5 ${color}`}
                >
                  <div className="shrink-0">
                    <div className="text-[13px] leading-tight font-semibold">
                      {stage.name}
                    </div>
                    <div className="text-[10px] opacity-75">
                      {stage.count} deals
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                    {stage.sponsors.slice(0, 4).map((sponsor, i) =>
                      sponsor.logo ? (
                        <div
                          key={i}
                          className="flex h-6 w-12 shrink-0 items-center justify-center rounded bg-white/80 px-0.5 dark:bg-gray-900/50"
                          title={sponsor.name}
                        >
                          <SponsorLogo
                            logo={sponsor.logo}
                            logoBright={sponsor.logoBright}
                            name={sponsor.name}
                            className="max-h-5 max-w-11"
                          />
                        </div>
                      ) : (
                        <span
                          key={i}
                          className="shrink-0 rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-medium dark:bg-gray-900/40"
                          title={sponsor.name}
                        >
                          {sponsor.name.length > 8
                            ? sponsor.name.slice(0, 8) + '…'
                            : sponsor.name}
                        </span>
                      ),
                    )}
                    {stage.sponsors.length > 4 && (
                      <span className="shrink-0 text-[10px] opacity-60">
                        +{stage.sponsors.length - 4}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] font-bold">
                      kr {(stage.value / 1000).toFixed(0)}k
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
