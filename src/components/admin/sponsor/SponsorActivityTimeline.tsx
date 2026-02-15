'use client'

import React, { useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import Image from 'next/image'
import Link from 'next/link'
import type { SponsorActivityExpanded } from '@/lib/sponsor-crm/types'
import { ArrowPathIcon, UserIcon } from '@heroicons/react/24/outline'
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns'
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

interface SponsorDayGroup {
  dateKey: string
  dateLabel: string
  sponsorGroups: {
    sponsorId: string
    sponsorName: string
    sponsorForConferenceId: string
    activities: SponsorActivityExpanded[]
  }[]
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMMM d')
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10)
}

function groupActivities(
  activities: SponsorActivityExpanded[],
): SponsorDayGroup[] {
  const dayMap = new Map<
    string,
    {
      dateLabel: string
      sponsors: Map<
        string,
        {
          sponsorName: string
          sponsorForConferenceId: string
          activities: SponsorActivityExpanded[]
        }
      >
    }
  >()

  for (const activity of activities) {
    const dateKey = getDateKey(activity.createdAt)
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, {
        dateLabel: getDateLabel(activity.createdAt),
        sponsors: new Map(),
      })
    }

    const day = dayMap.get(dateKey)!
    const sponsorId = activity.sponsorForConference.sponsor._id
    if (!day.sponsors.has(sponsorId)) {
      day.sponsors.set(sponsorId, {
        sponsorName: activity.sponsorForConference.sponsor.name,
        sponsorForConferenceId: activity.sponsorForConference._id,
        activities: [],
      })
    }
    day.sponsors.get(sponsorId)!.activities.push(activity)
  }

  return Array.from(dayMap.entries()).map(([dateKey, day]) => ({
    dateKey,
    dateLabel: day.dateLabel,
    sponsorGroups: Array.from(day.sponsors.entries()).map(
      ([sponsorId, group]) => ({
        sponsorId,
        ...group,
      }),
    ),
  }))
}

function UserAvatar({
  name,
  image,
  size = 'sm',
}: {
  name: string
  image?: string
  size?: 'sm' | 'md'
}) {
  const sizeClasses = size === 'md' ? 'h-8 w-8' : 'h-5 w-5'

  if (image && image.length > 0) {
    return (
      <Image
        src={image}
        alt={name}
        width={size === 'md' ? 32 : 20}
        height={size === 'md' ? 32 : 20}
        className={clsx(sizeClasses, 'rounded-full object-cover')}
      />
    )
  }

  return (
    <div
      className={clsx(
        sizeClasses,
        'flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600',
      )}
    >
      <UserIcon
        className={clsx(
          size === 'md' ? 'h-4 w-4' : 'h-3 w-3',
          'text-gray-500 dark:text-gray-400',
        )}
      />
    </div>
  )
}

function ActivityLine({ activity }: { activity: SponsorActivityExpanded }) {
  const iconType = useMemo(
    () => getActivityIcon(activity.activityType),
    [activity.activityType],
  )
  const timeAgo = formatDistanceToNow(new Date(activity.createdAt), {
    addSuffix: true,
  })

  return (
    <div className="group flex items-start gap-2.5 py-1.5">
      <div
        className={clsx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          getActivityColor(activity.activityType),
        )}
      >
        {React.createElement(iconType, { className: 'h-3 w-3' })}
      </div>
      <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">
        {activity.description}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <UserAvatar
          name={activity.createdBy.name}
          image={activity.createdBy.image}
          size="sm"
        />
        <time className="text-xs text-gray-400 dark:text-gray-500">
          {timeAgo}
        </time>
      </div>
    </div>
  )
}

function SponsorCard({
  sponsorName,
  sponsorForConferenceId,
  activities,
  hideSponsorName,
}: {
  sponsorName: string
  sponsorForConferenceId: string
  activities: SponsorActivityExpanded[]
  hideSponsorName: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-700/30">
      {!hideSponsorName && (
        <div className="mb-1.5 flex items-center gap-2">
          <Link
            href={`/admin/sponsors/crm?sponsor=${sponsorForConferenceId}&view=history`}
            className="text-sm font-semibold text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
          >
            {sponsorName}
          </Link>
          <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            {activities.length}
          </span>
        </div>
      )}
      <div
        className={clsx(
          'divide-y divide-gray-100 dark:divide-gray-700/50',
          hideSponsorName && '-my-1',
        )}
      >
        {activities.map((activity) => (
          <ActivityLine key={activity._id} activity={activity} />
        ))}
      </div>
    </div>
  )
}

export function SponsorActivityTimeline({
  conferenceId,
  sponsorForConferenceId,
  limit = 10,
  showHeaderFooter = true,
}: SponsorActivityTimelineProps) {
  const { data: activities = [], isLoading } =
    api.sponsor.crm.activities.list.useQuery({
      conferenceId: sponsorForConferenceId ? undefined : conferenceId,
      sponsorForConferenceId,
      limit,
    })

  const grouped = useMemo(() => groupActivities(activities), [activities])

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
        <div className={clsx('space-y-5', showHeaderFooter && 'mt-4')}>
          {grouped.map((dayGroup) => (
            <div key={dayGroup.dateKey}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
                  {dayGroup.dateLabel}
                </span>
                <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700/50" />
              </div>
              <div className="space-y-2">
                {dayGroup.sponsorGroups.map((group) => (
                  <SponsorCard
                    key={group.sponsorId}
                    sponsorName={group.sponsorName}
                    sponsorForConferenceId={group.sponsorForConferenceId}
                    activities={group.activities}
                    hideSponsorName={!!sponsorForConferenceId}
                  />
                ))}
              </div>
            </div>
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
