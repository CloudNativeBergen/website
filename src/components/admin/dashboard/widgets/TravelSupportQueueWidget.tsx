'use client'

import Link from 'next/link'
import {
  BanknotesIcon,
  GlobeAltIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { type TravelSupportData } from '@/lib/dashboard/data-types'
import { fetchTravelSupport } from '@/app/(admin)/admin/actions'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { formatNumber } from '@/lib/format'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import {
  WidgetSkeleton,
  WidgetEmptyState,
  WidgetErrorState,
  WidgetHeader,
  WidgetBody,
  PhaseBadge,
  ProgressBar,
} from './shared'

interface TravelSupportConfig {
  showPendingRequests?: boolean
  showBudgetUtilization?: boolean
}

type TravelSupportQueueWidgetProps = BaseWidgetProps<TravelSupportConfig>

export function TravelSupportQueueWidget({
  conference,
  config,
}: TravelSupportQueueWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const { data, loading, error, refetch } = useWidgetData<TravelSupportData>(
    conference ? () => fetchTravelSupport(conference) : null,
    [conference],
  )

  // Loading and error come FIRST — phase branches must not mask fetch
  // errors as setup cards or flash wrong content while loading.
  if (loading) {
    return <WidgetSkeleton />
  }

  if (error) {
    return <WidgetErrorState onRetry={refetch} />
  }

  // Fraction of budget used; null when no budget is configured (avoid NaN/∞)
  const budgetUsed =
    data && data.budgetAllocated > 0
      ? (data.totalApproved / data.budgetAllocated) * 100
      : null

  // Phase-specific: Initialization/Planning - Show setup guidance
  if (
    (phase === 'initialization' || phase === 'planning') &&
    (!data || data.totalRequested === 0)
  ) {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Travel Support"
          badge={<PhaseBadge label="Planning" variant="blue" />}
        />

        <WidgetBody className="space-y-3">
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
                <BanknotesIcon className="h-4 w-4 text-gray-400" />
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(data.budgetAllocated / 1000).toFixed(0)}k
                </div>
              </div>
            </div>
          )}
        </WidgetBody>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show final summary
  if (phase === 'post-conference' && data) {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Travel Support"
          badge={<PhaseBadge label="Complete" variant="green" />}
        />

        <WidgetBody className="grid grid-cols-2 content-start gap-3">
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <CheckCircleIcon className="mb-2 h-6 w-6 text-green-500" />
            <div className="text-[10px] font-medium text-green-600 uppercase dark:text-green-400">
              Total Approved
            </div>
            <div className="mt-1 text-3xl font-bold text-green-900 dark:text-green-100">
              kr {(data.totalApproved / 1000).toFixed(0)}k
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <div className="text-[10px] font-medium text-blue-600 uppercase dark:text-blue-400">
              Budget Used
            </div>
            <div className="mt-1 text-3xl font-bold text-blue-900 dark:text-blue-100">
              {budgetUsed !== null ? `${budgetUsed.toFixed(0)}%` : '—'}
            </div>
          </div>

          <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
            <div className="text-[10px] font-medium text-purple-600 uppercase dark:text-purple-400">
              Speakers Supported
            </div>
            <div className="mt-1 text-3xl font-bold text-purple-900 dark:text-purple-100">
              {data.approvedCount}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <div className="text-[10px] font-medium text-gray-600 uppercase dark:text-gray-400">
              Avg per Speaker
            </div>
            <div className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {data.approvedCount > 0
                ? `kr ${formatNumber(Math.round(data.totalApproved / data.approvedCount))}`
                : '—'}
            </div>
          </div>
        </WidgetBody>
      </div>
    )
  }

  if (!data) {
    return <WidgetEmptyState message="No travel support data available" />
  }

  // Default operational view (execution phase)

  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        title="Travel Support"
        link={{ href: '/admin/speakers/travel-support', label: 'Review →' }}
      />

      {/* Scrollable body (flex column so the empty state can still center in
          leftover space); the request list grows unbounded with pending
          requests and must scroll, not clip. */}
      <WidgetBody className="flex flex-col">
        {(config?.showPendingRequests ?? true) && data.pendingApprovals > 0 && (
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
              kr {(data.totalApproved / 1000).toFixed(1)}k
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800">
            <div className="text-[11px] text-gray-600 dark:text-gray-300">
              Requested
            </div>
            <div className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
              kr {(data.totalRequested / 1000).toFixed(1)}k
            </div>
          </div>
        </div>

        {(config?.showBudgetUtilization ?? true) && budgetUsed !== null && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                Budget Usage
              </h4>
              <span className="text-[11px] text-gray-600 dark:text-gray-300">
                kr {(data.budgetAllocated / 1000).toFixed(0)}k total
              </span>
            </div>
            <ProgressBar
              value={budgetUsed}
              color={
                budgetUsed > 90
                  ? 'bg-red-600 dark:bg-red-500'
                  : budgetUsed > 70
                    ? 'bg-amber-600 dark:bg-amber-500'
                    : 'bg-green-600 dark:bg-green-500'
              }
              className="h-1.5"
            />
            <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-300">
              {budgetUsed.toFixed(0)}% used
            </div>
          </div>
        )}

        {data.requests.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
              Pending Requests
            </h4>
            {/* No width-keyed item caps (old nth-child hiding) — the body
              scrolls, so every pending request is rendered and reachable. */}
            <div className="space-y-2">
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
                      <BanknotesIcon className="h-3 w-3" />
                      {formatNumber(request.amount)}
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
      </WidgetBody>
    </div>
  )
}
