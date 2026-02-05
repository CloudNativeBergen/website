'use client'

import React, { useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import Link from 'next/link'
import type { SponsorActivityExpanded } from '@/lib/sponsor-crm/types'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import {
  getActivityIcon,
  getActivityColor,
} from '@/components/admin/sponsor-crm/utils'

interface SponsorActivityTimelineProps {
  conferenceId: string
  sponsorForConferenceId?: string
  limit?: number
  showHeaderFooter?: boolean
}

function ActivityItem({
  activity,
  hideSponsorName = false,
}: {
  activity: SponsorActivityExpanded
  hideSponsorName?: boolean
}) {
  const iconType = useMemo(
    () => getActivityIcon(activity.activity_type),
    [activity.activity_type],
  )
  const timeAgo = formatDistanceToNow(new Date(activity.created_at), {
    addSuffix: true,
  })

  return (
    <div className="flex gap-3">
      <div
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          getActivityColor(activity.activity_type),
        )}
      >
        {React.createElement(iconType, { className: 'h-4 w-4' })}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {!hideSponsorName && (
              <Link
                href={`/admin/sponsors/crm?sponsor=${activity.sponsor_for_conference._id}`}
                className="text-sm font-medium text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
              >
                {activity.sponsor_for_conference.sponsor.name}
              </Link>
            )}
            <p
              className={clsx(
                'text-sm text-gray-600 dark:text-gray-400',
                !hideSponsorName && 'mt-1',
              )}
            >
              {activity.description}
            </p>
          </div>
          <time className="text-xs whitespace-nowrap text-gray-500 dark:text-gray-500">
            {timeAgo}
          </time>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
          by {activity.created_by.name}
        </p>
      </div>
    </div>
  )
}

export function SponsorActivityTimeline({
  conferenceId,
  sponsorForConferenceId,
  limit = 6,
  showHeaderFooter = true,
}: SponsorActivityTimelineProps) {
  const { data: activities = [], isLoading } =
    api.sponsor.crm.activities.list.useQuery({
      conferenceId: sponsorForConferenceId ? undefined : conferenceId,
      sponsorForConferenceId,
      limit,
    })

  if (isLoading) {
    return (
      <div
        className={clsx(
          showHeaderFooter &&
            'rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800',
        )}
      >
        {showHeaderFooter && (
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Activity
          </h3>
        )}
        <div className={clsx('space-y-4', showHeaderFooter && 'mt-4')}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        showHeaderFooter &&
          'rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800',
      )}
    >
      {showHeaderFooter && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Activity
        </h3>
      )}

      {activities.length === 0 ? (
        <div
          className={clsx(
            'rounded-lg border-2 border-dashed border-gray-300 p-6 text-center dark:border-gray-600',
            showHeaderFooter && 'mt-4',
          )}
        >
          <ArrowPathIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No activity yet
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Activity will appear here as you work with sponsors.
          </p>
        </div>
      ) : (
        <div className={clsx('space-y-4', showHeaderFooter && 'mt-4')}>
          {activities.slice(0, limit).map((activity) => (
            <ActivityItem
              key={activity._id}
              activity={activity}
              hideSponsorName={!!sponsorForConferenceId}
            />
          ))}
        </div>
      )}

      {showHeaderFooter && activities.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Link
            href="/admin/sponsors/activity"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            View full activity log →
          </Link>
        </div>
      )}
    </div>
  )
}
