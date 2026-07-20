'use client'

import React, { useMemo, useState } from 'react'
import { api } from '@/lib/trpc/client'
import Image from 'next/image'
import Link from 'next/link'
import type {
  ActivityType,
  SponsorActivityExpanded,
} from '@/lib/sponsor-crm/types'
import {
  ArrowPathIcon,
  PencilSquareIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { BoltIcon } from '@heroicons/react/24/solid'
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns'
import clsx from 'clsx'
import {
  getActivityIcon,
  getActivityColor,
} from '@/components/admin/sponsor-crm/utils'
import { SponsorActivityInput } from './SponsorActivityInput'
import { useNotificationSafe } from '@/components/admin/NotificationProvider'

interface SponsorActivityTimelineProps {
  sponsorForConferenceId?: string
  limit?: number
  showHeaderFooter?: boolean
  compact?: boolean
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
  isSystem,
  size = 'sm',
}: {
  name: string
  image?: string
  isSystem?: boolean
  size?: 'sm' | 'md'
}) {
  const sizeClasses = size === 'md' ? 'h-8 w-8' : 'h-6 w-6'
  const iconSize = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5'

  if (image && image.length > 0) {
    return (
      <Image
        src={image}
        alt={name}
        width={size === 'md' ? 64 : 48}
        height={size === 'md' ? 64 : 48}
        className={clsx(sizeClasses, 'rounded-full object-cover')}
        title={name}
      />
    )
  }

  if (isSystem) {
    return (
      <div
        className={clsx(
          sizeClasses,
          'flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30',
        )}
        title="Automatic"
      >
        <BoltIcon
          className={clsx(iconSize, 'text-amber-600 dark:text-amber-400')}
        />
      </div>
    )
  }

  return (
    <div
      className={clsx(
        sizeClasses,
        'flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600',
      )}
      title={name}
    >
      <UserIcon
        className={clsx(iconSize, 'text-gray-500 dark:text-gray-400')}
      />
    </div>
  )
}

/** Activity types a user authored by hand — the only ones the UI lets you edit. */
const EDITABLE_ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set([
  'note',
  'call',
  'meeting',
  'email',
])

function ActivityLine({
  activity,
  compact,
  onSave,
  isSaving,
}: {
  activity: SponsorActivityExpanded
  compact?: boolean
  /** Persist an edited description; omitted in compact/read-only contexts. */
  onSave?: (activityId: string, description: string) => void
  isSaving?: boolean
}) {
  const iconType = useMemo(
    () => getActivityIcon(activity.activityType),
    [activity.activityType],
  )
  const timeAgo = formatDistanceToNow(new Date(activity.createdAt), {
    addSuffix: true,
  })

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(activity.description)

  // Editing is offered only for user-authored types (server re-checks type AND
  // creator; a non-owner's save is rejected there).
  const isEditable =
    !compact && !!onSave && EDITABLE_ACTIVITY_TYPES.has(activity.activityType)

  const startEdit = () => {
    setDraft(activity.description)
    setIsEditing(true)
  }
  const cancelEdit = () => setIsEditing(false)
  const saveEdit = () => {
    const next = draft.trim()
    if (next.length === 0) return
    onSave?.(activity._id, next)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="flex items-start gap-2.5 py-1.5">
        <div
          className={clsx(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
            getActivityColor(activity.activityType),
          )}
        >
          {React.createElement(iconType, { className: 'h-3 w-3' })}
        </div>
        <div className="min-w-0 flex-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            aria-label="Edit activity description"
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isSaving}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={isSaving || draft.trim().length === 0}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'group flex items-start py-1.5',
        compact ? 'gap-2' : 'gap-2.5',
      )}
    >
      <div
        className={clsx(
          compact ? 'mt-0 flex h-4 w-4' : 'mt-0.5 flex h-5 w-5',
          'shrink-0 items-center justify-center rounded-full',
          getActivityColor(activity.activityType),
        )}
      >
        {React.createElement(iconType, {
          className: compact ? 'h-2.5 w-2.5' : 'h-3 w-3',
        })}
      </div>
      <p
        className={clsx(
          'min-w-0 flex-1 text-gray-600 dark:text-gray-300',
          compact ? 'text-xs' : 'text-sm',
        )}
      >
        {compact && activity.description.length > 50
          ? activity.description.substring(0, 50) + '...'
          : activity.description}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        {isEditable && (
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit activity"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </button>
        )}
        {!compact && (
          <UserAvatar
            name={activity.createdBy?.name ?? 'Automatic'}
            image={activity.createdBy?.image}
            isSystem={!activity.createdBy}
            size="sm"
          />
        )}
        <time
          className={clsx(
            'text-gray-400 dark:text-gray-500',
            compact ? 'text-[10px]' : 'text-xs',
          )}
        >
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
  compact,
  onSave,
  isSaving,
}: {
  sponsorName: string
  sponsorForConferenceId: string
  activities: SponsorActivityExpanded[]
  hideSponsorName: boolean
  compact?: boolean
  onSave?: (activityId: string, description: string) => void
  isSaving?: boolean
}) {
  return (
    <div>
      {!hideSponsorName && (
        <div className="mb-1 flex items-center gap-2">
          <Link
            href={`/admin/sponsors/crm?sponsor=${sponsorForConferenceId}&view=history`}
            className="text-sm font-semibold text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
          >
            {sponsorName}
          </Link>
          {activities.length > 1 && (
            <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              {activities.length}
            </span>
          )}
        </div>
      )}
      <div
        className={clsx(
          'divide-y divide-gray-100 dark:divide-gray-700/50',
          hideSponsorName && '-my-1',
        )}
      >
        {activities.map((activity) => (
          <ActivityLine
            key={activity._id}
            activity={activity}
            compact={compact}
            onSave={onSave}
            isSaving={isSaving}
          />
        ))}
      </div>
    </div>
  )
}

export function SponsorActivityTimeline({
  sponsorForConferenceId,
  limit = 10,
  showHeaderFooter = true,
  compact = false,
}: SponsorActivityTimelineProps) {
  const utils = api.useUtils()
  const notify = useNotificationSafe()
  const { data: activities = [], isLoading } =
    api.sponsor.crm.activities.list.useQuery({
      sponsorForConferenceId,
      limit,
    })

  const updateMutation = api.sponsor.crm.activities.update.useMutation({
    onSuccess: () => {
      utils.sponsor.crm.activities.list.invalidate()
    },
    onError: () => {
      // The activity may have been deleted underneath the editor; surface a
      // toast instead of letting the failed save pass silently.
      notify?.showNotification({
        type: 'error',
        title: 'Save failed',
        message: 'Couldn’t save the change — it may have been deleted.',
      })
    },
  })

  const handleSaveEdit = (activityId: string, description: string) => {
    updateMutation.mutate({ id: activityId, description })
  }

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

      {sponsorForConferenceId && (
        <div className={clsx(showHeaderFooter && 'mt-4')}>
          <SponsorActivityInput
            sponsorForConferenceId={sponsorForConferenceId}
          />
        </div>
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
        <div
          className={clsx(
            'space-y-5',
            showHeaderFooter && 'mt-4',
            compact && '!space-y-2',
          )}
        >
          {grouped.map((dayGroup) => (
            <div key={dayGroup.dateKey}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
                  {dayGroup.dateLabel}
                </span>
                <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700/50" />
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {dayGroup.sponsorGroups.map((group) => (
                  <SponsorCard
                    key={group.sponsorId}
                    sponsorName={group.sponsorName}
                    sponsorForConferenceId={group.sponsorForConferenceId}
                    activities={group.activities}
                    hideSponsorName={!!sponsorForConferenceId}
                    compact={compact}
                    onSave={handleSaveEdit}
                    isSaving={updateMutation.isPending}
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
