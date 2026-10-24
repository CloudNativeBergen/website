/**
 * THE POSTING LIMITS (Photo Wall spec §6.3). One read of the three counts on
 * the NON-CDN client (a CDN read lags the post just written, §6.2), and a
 * pure decision naming the limit that refuses, so the phone can show the
 * message for it. Both pending limits count `pending` posts; the hourly limit
 * counts the device's posts with `submittedAt` in the last 60 minutes,
 * whatever their status. Two phones racing the last place can overshoot by
 * one; accepted (§6.3).
 */
import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'

export const MAX_PENDING_PER_DEVICE = 3
export const MAX_PENDING_PER_WALL = 200
export const MAX_POSTS_PER_DEVICE_PER_HOUR = 10
const HOUR_MS = 60 * 60 * 1000

export interface PostingCounts {
  pendingByDevice: number
  pendingOnWall: number
  byDeviceInLastHour: number
}

/** Which limit refused, in the order of the §6.3 table. */
export type PostingLimit = 'pendingDevice' | 'hourly' | 'pendingWall'

/**
 * Three roots, each scoped to the conference by hand: `scopedFetch` scopes
 * the FIRST `*[` only, and these are siblings in one projection.
 */
const COUNTS_QUERY = `{
  "pendingByDevice": count(*[_type == "wallPost" && conference._ref == $conferenceId && deviceKey == $deviceKey && status == "pending"]),
  "pendingOnWall": count(*[_type == "wallPost" && conference._ref == $conferenceId && status == "pending"]),
  "byDeviceInLastHour": count(*[_type == "wallPost" && conference._ref == $conferenceId && deviceKey == $deviceKey && dateTime(submittedAt) > dateTime($since)])
}`

export async function readPostingCounts(
  conferenceId: string,
  deviceKey: string,
  now: Date,
): Promise<PostingCounts> {
  const counts = await clientReadUncached.fetch<Partial<PostingCounts>>(
    COUNTS_QUERY,
    {
      conferenceId,
      deviceKey,
      since: new Date(now.getTime() - HOUR_MS).toISOString(),
    },
  )
  return {
    pendingByDevice: counts.pendingByDevice ?? 0,
    pendingOnWall: counts.pendingOnWall ?? 0,
    byDeviceInLastHour: counts.byDeviceInLastHour ?? 0,
  }
}

/**
 * The limit a post would break, or null. The device's own limits come first:
 * their messages tell the contributor what to do, the wall's only to wait.
 */
export function postingLimitHit(counts: PostingCounts): PostingLimit | null {
  if (counts.pendingByDevice >= MAX_PENDING_PER_DEVICE) return 'pendingDevice'
  if (counts.byDeviceInLastHour >= MAX_POSTS_PER_DEVICE_PER_HOUR) {
    return 'hourly'
  }
  if (counts.pendingOnWall >= MAX_PENDING_PER_WALL) return 'pendingWall'
  return null
}
