/**
 * THE POSTING WINDOW (Photo Wall spec §7). Pure: it takes `now`.
 *
 * Automatic, the default, opens posting at 00:00 on the conference's first
 * day (`startDate`) and closes it at the end of its last (23:59:59 on
 * `endDate`), Europe/Oslo. Open and Paused are the organizer's overrides:
 * open early, or pause. Posting closes at the end of the last day whatever
 * the switch says, so a wall nobody pauses doesn't take anonymous posts for
 * a month. A conference with no usable `endDate` never opens: the close could
 * not be enforced. Nor does an Automatic wall with no usable `startDate`: it
 * has no day to open on.
 */
import { isCalendarDate, osloLocalInputToIso } from '@/lib/time'
import { POSTING_MODES, type PostingMode } from './types'

interface WallSettings {
  postingMode?: PostingMode | null
  closedAt?: string | null
}

interface ConferenceDays {
  startDate?: string | null
  endDate?: string | null
}

/** Oslo midnight at the start of a calendar day, or null for no usable day. */
function osloMidnight(date: string | null | undefined): Date | null {
  if (!date || !isCalendarDate(date)) return null
  const iso = osloLocalInputToIso(`${date}T00:00`)
  return iso ? new Date(iso) : null
}

/** The first instant of the conference's first day, Oslo midnight. */
function postingOpensAt(startDate: string | null | undefined): Date | null {
  return osloMidnight(startDate)
}

/** The first instant after the conference's last day, Oslo midnight. */
function postingClosesAt(endDate: string | null | undefined): Date | null {
  if (!endDate || !isCalendarDate(endDate)) return null
  const [y, m, d] = endDate.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return osloMidnight(next)
}

/**
 * Whether posting is open, and if not, why: the wall was closed by the
 * retention cron, an organizer paused it, the conference has no usable end
 * date, its last day is over, or (Automatic) the conference has no usable
 * start date or its first day has not begun.
 */
export type PostingState =
  | 'open'
  | 'closed'
  | 'paused'
  | 'noEndDate'
  | 'ended'
  | 'noStartDate'
  | 'notYetOpen'

/**
 * The mode the window runs on. A missing mode is Automatic (§7); anything the
 * switch does not offer is Paused, so a stray stored value never opens
 * posting.
 */
function modeOf(wall: WallSettings): PostingMode {
  const mode = wall.postingMode
  if (mode == null) return 'auto'
  return (POSTING_MODES as readonly string[]).includes(mode) ? mode : 'paused'
}

export function postingState(
  wall: WallSettings,
  conference: ConferenceDays,
  now: Date,
): PostingState {
  if (wall.closedAt) return 'closed'
  const mode = modeOf(wall)
  if (mode === 'paused') return 'paused'
  const closesAt = postingClosesAt(conference.endDate)
  if (!closesAt) return 'noEndDate'
  if (now >= closesAt) return 'ended'
  if (mode === 'open') return 'open'
  const opensAt = postingOpensAt(conference.startDate)
  if (!opensAt) return 'noStartDate'
  return now < opensAt ? 'notYetOpen' : 'open'
}

/** The one rule Submit and the pages ask (§7). */
export function isPostingOpen(
  wall: WallSettings,
  conference: ConferenceDays,
  now: Date,
): boolean {
  return postingState(wall, conference, now) === 'open'
}
