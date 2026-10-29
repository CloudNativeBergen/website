'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import {
  ACTIVITY_TYPE_LABELS,
  type ActivityType,
} from '@/lib/sponsor-crm/types'
import { ActivityLine } from './SponsorActivityTimeline'

/** Opens the sponsor's history in the board's side panel (#1703). */
export function activityLogHref(sponsorForConferenceId: string): string {
  return `/admin/sponsors/crm?sponsor=${encodeURIComponent(sponsorForConferenceId)}&view=history`
}

const selectClass =
  'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white'

/**
 * The full sponsor activity log (#1704 A1). Filters live in the URL
 * (`?sponsor=&owner=&type=`) so a filtered view can be shared.
 */
export function SponsorActivityLog() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const sponsor = params.get('sponsor') || undefined
  const owner = params.get('owner') || undefined
  const rawType = params.get('type')
  const type =
    rawType && rawType in ACTIVITY_TYPE_LABELS
      ? (rawType as ActivityType)
      : undefined

  const { data: sponsors = [] } = api.sponsor.crm.list.useQuery({})
  const { data: organizers = [] } = api.sponsor.crm.listOrganizers.useQuery()
  const log = api.sponsor.crm.activities.log.useInfiniteQuery(
    { sponsor, owner, type },
    { getNextPageParam: (page) => page.nextCursor },
  )

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const items = log.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Sponsor"
          className={selectClass}
          value={sponsor ?? ''}
          onChange={(e) => setFilter('sponsor', e.target.value)}
        >
          <option value="">All sponsors</option>
          {[...sponsors]
            .sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name))
            .map((s) => (
              <option key={s._id} value={s._id}>
                {s.sponsor.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Owner"
          className={selectClass}
          value={owner ?? ''}
          onChange={(e) => setFilter('owner', e.target.value)}
        >
          <option value="">All owners</option>
          {organizers.map((o) => (
            <option key={o._id} value={o._id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Activity type"
          className={selectClass}
          value={type ?? ''}
          onChange={(e) => setFilter('type', e.target.value)}
        >
          <option value="">All types</option>
          {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        {log.isPending ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading activity…
          </p>
        ) : log.isError ? (
          <p
            role="alert"
            className="py-8 text-center text-sm text-red-600 dark:text-red-400"
          >
            Could not load activity: {log.error.message}
          </p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No activity yet
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {items.map((activity) => (
              <li key={activity._id} className="py-1">
                <Link
                  href={activityLogHref(activity.sponsorForConference._id)}
                  className="text-xs font-semibold text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                >
                  {activity.sponsorForConference.sponsor.name}
                </Link>
                <ActivityLine activity={activity} />
              </li>
            ))}
          </ul>
        )}
        {log.hasNextPage && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => log.fetchNextPage()}
              disabled={log.isFetchingNextPage}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-gray-700"
            >
              {log.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
