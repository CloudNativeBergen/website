'use client'

import Link from 'next/link'
import {
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  UserIcon,
  SparklesIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { fetchRecentActivity } from '@/app/(admin)/admin/actions'
import { type ActivityItem } from '@/lib/dashboard/data-types'
import { SwipeablePaginationWidget } from './SwipeablePaginationWidget'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import { WidgetSkeleton, WidgetEmptyState } from './shared'

const activityIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  proposal: DocumentTextIcon,
  review: ChatBubbleLeftRightIcon,
  sponsor: CurrencyDollarIcon,
  speaker: UserIcon,
}

const activityColors: Record<string, string> = {
  proposal: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  review:
    'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  sponsor:
    'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  speaker: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
}

type RecentActivityFeedWidgetProps = BaseWidgetProps

export function RecentActivityFeedWidget({
  conference,
}: RecentActivityFeedWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const { data: activities, loading } = useWidgetData<ActivityItem[]>(
    conference ? () => fetchRecentActivity(conference._id) : null,
    [conference],
  )

  // Phase-specific: Initialization - Show welcome message
  if (phase === 'initialization') {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <SparklesIcon className="mb-3 h-12 w-12 text-blue-500" />
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Getting Started
        </h3>
        <p className="text-center text-xs text-gray-600 dark:text-gray-400">
          Begin configuring your conference. Activities will appear here as you
          work.
        </p>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show completion message
  if (phase === 'post-conference' && activities?.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <CheckCircleIcon className="mb-3 h-12 w-12 text-green-500" />
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Conference Complete
        </h3>
        <p className="text-center text-xs text-gray-600 dark:text-gray-400">
          All activities archived. Check individual sections for detailed
          history.
        </p>
      </div>
    )
  }

  if (loading) return <WidgetSkeleton />
  if (!activities || activities.length === 0) {
    return <WidgetEmptyState message="No recent activity" />
  }

  // Split activities into pages of 4 items each
  const itemsPerPage = 6
  const pages = []
  for (let i = 0; i < activities.length; i += itemsPerPage) {
    const pageActivities = activities.slice(i, i + itemsPerPage)
    pages.push(
      <div key={i} className="space-y-2">
        {pageActivities.map((activity) => {
          const Icon = activityIcons[activity.type] || DocumentTextIcon
          const colorClass =
            activityColors[activity.type] || activityColors.proposal

          const content = (
            <div className="flex gap-2.5">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colorClass}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] leading-tight font-medium text-gray-900 dark:text-gray-100">
                  {activity.description}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                  <span className="hidden @[250px]:inline">
                    {activity.user}
                  </span>
                  <span className="hidden @[250px]:inline">•</span>
                  <span>{activity.timestamp}</span>
                </div>
              </div>
            </div>
          )

          if (activity.link) {
            return (
              <Link
                key={activity.id}
                href={activity.link}
                className="block rounded-lg border border-gray-200 bg-white p-2.5 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
              >
                {content}
              </Link>
            )
          }

          return (
            <div
              key={activity.id}
              className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900"
            >
              {content}
            </div>
          )
        })}
      </div>,
    )
  }

  return (
    <SwipeablePaginationWidget
      title="Recent Activity"
      pages={pages}
      showArrows={true}
      showDots={true}
    />
  )
}
