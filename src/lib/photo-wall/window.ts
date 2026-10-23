/**
 * THE POSTING WINDOW (Photo Wall spec §7). Pure: it takes `now`.
 *
 * Monday has no automatic opening, but posting always closes at the end of
 * the conference's last day (23:59:59 on `endDate`, Europe/Oslo) whatever the
 * switch says, so a wall nobody pauses doesn't take anonymous posts for a
 * month. A conference with no usable `endDate` never opens: the close could
 * not be enforced.
 */
import { isCalendarDate, osloLocalInputToIso } from '@/lib/time'
import type { PostingMode } from './types'

interface WallSettings {
  postingMode?: PostingMode | null
  closedAt?: string | null
}

/** The first instant after the conference's last day, Oslo midnight. */
function postingClosesAt(endDate: string | null | undefined): Date | null {
  if (!endDate || !isCalendarDate(endDate)) return null
  const [y, m, d] = endDate.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  const iso = osloLocalInputToIso(`${next}T00:00`)
  return iso ? new Date(iso) : null
}

/**
 * Whether posting is open, and if not, why: the wall was closed by the
 * retention cron, an organizer paused it, the conference has no usable end
 * date, or its last day is over.
 */
export type PostingState = 'open' | 'closed' | 'paused' | 'noEndDate' | 'ended'

export function postingState(
  wall: WallSettings,
  conference: { endDate?: string | null },
  now: Date,
): PostingState {
  if (wall.closedAt) return 'closed'
  if (wall.postingMode !== 'open') return 'paused'
  const closesAt = postingClosesAt(conference.endDate)
  if (!closesAt) return 'noEndDate'
  return now < closesAt ? 'open' : 'ended'
}

/** The one rule Submit and the pages ask (§7). */
export function isPostingOpen(
  wall: WallSettings,
  conference: { endDate?: string | null },
  now: Date,
): boolean {
  return postingState(wall, conference, now) === 'open'
}
