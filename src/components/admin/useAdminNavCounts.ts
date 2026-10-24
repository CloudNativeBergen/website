'use client'

import { useMemo } from 'react'
import type { AdminNavCount } from '@/lib/admin/registry'
import { countByTab } from '@/lib/photo-wall/moderation'
import { api } from '@/lib/trpc/client'

/**
 * How the shell reads a nav count: when it mounts (it stays mounted across
 * admin navigations), and on returning to the tab once a minute old. Not
 * polled, not retried: a count that fails or has not answered is missing,
 * and its entry shows no badge.
 */
const SHELL_COUNT = { retry: false, refetchOnWindowFocus: true } as const

/** The counts the admin nav shows (see `withNavBadges`). */
export function useAdminNavCounts(): Partial<Record<AdminNavCount, number>> {
  // Session Feedback (speaker feedback spec §10.1): read again when
  // /admin/feedback acts on a flag; a flag that lands meanwhile rings the
  // bell.
  const flagged = api.sessionFeedback.flaggedCount.useQuery(
    undefined,
    SHELL_COUNT,
  )
  // Photo Wall (Photo Wall spec §10, P6). While /admin/photo-wall is open its
  // 10 s poll of the queue is newer, and the badge follows it, the page's
  // own actions included. The shell only OBSERVES that query: it never
  // fetches the queue on another admin page.
  const pending = api.photoWall.pendingCount.useQuery(undefined, SHELL_COUNT)
  const queue = api.photoWall.moderationQueue.useQuery(undefined, {
    enabled: false,
  })
  const pendingWallPosts =
    queue.data && queue.dataUpdatedAt > pending.dataUpdatedAt
      ? countByTab(queue.data.posts).pending
      : pending.data

  return useMemo(
    () => ({ flaggedFeedback: flagged.data, pendingWallPosts }),
    [flagged.data, pendingWallPosts],
  )
}
