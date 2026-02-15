'use client'

import {
  CheckCircleIcon,
  ClockIcon,
  PaperAirplaneIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { type ProposalPipelineData } from '@/lib/dashboard/data-types'
import { fetchProposalPipeline } from '@/app/(admin)/admin/actions'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import {
  WidgetSkeleton,
  WidgetEmptyState,
  WidgetErrorState,
  WidgetHeader,
  PhaseBadge,
} from './shared'

interface ProposalPipelineConfig {
  targetAcceptanceRate?: number
  showPercentages?: boolean
}

type ProposalPipelineWidgetProps = BaseWidgetProps<ProposalPipelineConfig>

export function ProposalPipelineWidget({
  conference,
  config,
}: ProposalPipelineWidgetProps) {
  const { data, loading, error, refetch } = useWidgetData<ProposalPipelineData>(
    conference ? () => fetchProposalPipeline(conference._id) : null,
    [conference],
  )
  const phase = conference ? getCurrentPhase(conference) : null

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetErrorState onRetry={refetch} />

  // Phase-specific: Initialization/Planning - Show CFP setup guidance
  if (phase === 'initialization' || phase === 'planning') {
    const now = new Date()
    const daysUntilCFP = conference
      ? Math.ceil(
          (new Date(conference.cfpStartDate).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0
    const cfpDuration = conference
      ? Math.ceil(
          (new Date(conference.cfpEndDate).getTime() -
            new Date(conference.cfpStartDate).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0

    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Proposal Pipeline"
          badge={<PhaseBadge label="Setup" variant="blue" />}
        />

        <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-800/50">
            <CalendarIcon className="mb-2 h-8 w-8 text-blue-500" />
            <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
              CFP Planning
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Configure proposal submission settings and prepare for incoming
              talks.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                CFP Opens
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {daysUntilCFP > 0 ? `${daysUntilCFP}d` : 'Open'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Duration
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {cfpDuration}d
              </div>
            </div>
          </div>

          {data?.total && data.total > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Early Submissions
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {data.total}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show summary stats
  if (phase === 'post-conference') {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Proposal Pipeline"
          badge={<PhaseBadge label="Complete" variant="green" />}
        />

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto">
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <PaperAirplaneIcon className="mb-2 h-6 w-6 text-blue-500" />
            <div className="text-[10px] font-medium text-blue-600 uppercase dark:text-blue-400">
              Total Submissions
            </div>
            <div className="mt-1 text-3xl font-bold text-blue-900 dark:text-blue-100">
              {data?.total}
            </div>
          </div>

          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <CheckCircleIcon className="mb-2 h-6 w-6 text-green-500" />
            <div className="text-[10px] font-medium text-green-600 uppercase dark:text-green-400">
              Acceptance Rate
            </div>
            <div className="mt-1 text-3xl font-bold text-green-900 dark:text-green-100">
              {(data?.acceptanceRate ?? 0).toFixed(0)}%
            </div>
          </div>

          <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
            <div className="text-[10px] font-medium text-purple-600 uppercase dark:text-purple-400">
              Talks Delivered
            </div>
            <div className="mt-1 text-3xl font-bold text-purple-900 dark:text-purple-100">
              {data?.confirmed}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <div className="text-[10px] font-medium text-gray-600 uppercase dark:text-gray-400">
              Speakers
            </div>
            <div className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {data?.confirmed}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Default operational view (execution phase or no conference)
  if (!data || data.total === 0) {
    return <WidgetEmptyState message="No proposal data available" />
  }

  const acceptedPercentage = (data.accepted / data.total) * 100
  const rejectedPercentage = (data.rejected / data.total) * 100
  const confirmedPercentage = (data.confirmed / data.total) * 100
  const showPercentages = config?.showPercentages ?? true

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <WidgetHeader
        title="Proposal Pipeline"
        link={{ href: '/admin/proposals', label: 'View all →' }}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Main Stats - Redesigned as overlapping cards */}
        <div className="mb-4 grid shrink-0 grid-cols-3 gap-2 @[400px]:gap-3">
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
        <div className="grid shrink-0 grid-cols-1 gap-2 @[450px]:grid-cols-2 @[450px]:gap-3">
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
                {showPercentages && ' (100%)'}
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
                {showPercentages && ` (${acceptedPercentage.toFixed(0)}%)`}
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
                {showPercentages && ` (${rejectedPercentage.toFixed(0)}%)`}
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
                {showPercentages && ` (${confirmedPercentage.toFixed(0)}%)`}
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
    </div>
  )
}
