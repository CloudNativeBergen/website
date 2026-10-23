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
export function postingClosesAt(
  endDate: string | null | undefined,
): Date | null {
  if (!endDate || !isCalendarDate(endDate)) return null
  const [y, m, d] = endDate.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  const iso = osloLocalInputToIso(`${next}T00:00`)
  return iso ? new Date(iso) : null
}

export function isPostingOpen(
  wall: WallSettings,
  conference: { endDate?: string | null },
  now: Date,
): boolean {
  if (wall.postingMode !== 'open' || wall.closedAt) return false
  const closesAt = postingClosesAt(conference.endDate)
  return closesAt !== null && now < closesAt
}
