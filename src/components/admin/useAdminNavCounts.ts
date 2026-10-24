'use client'

import { useMemo } from 'react'
import type { AdminNavCounts } from '@/lib/admin/registry'
import { api } from '@/lib/trpc/client'

/**
 * How the shell reads a nav count: when it mounts (it stays mounted across
 * admin navigations), and on returning to the tab once a minute old. Not
 * polled, not retried: a count that fails or has not answered is missing,
 * and its entry shows no badge. The page a count belongs to keeps it fresh
 * while it is open: /admin/feedback invalidates the flagged count when it
 * acts on a flag, /admin/photo-wall pushes each pending count it polls.
 */
const SHELL_COUNT = { retry: false, refetchOnWindowFocus: true } as const

/** The counts the admin nav shows (see `withNavBadges`). */
export function useAdminNavCounts(): AdminNavCounts {
  const flagged = api.sessionFeedback.flaggedCount.useQuery(
    undefined,
    SHELL_COUNT,
  )
  const pending = api.photoWall.pendingCount.useQuery(undefined, SHELL_COUNT)
  return useMemo(
    () => ({ flaggedFeedback: flagged.data, pendingWallPosts: pending.data }),
    [flagged.data, pending.data],
  )
}
