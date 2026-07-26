import type { Conference } from '@/lib/conference/types'
import { toOsloAnchoredDate } from '@/lib/time'
import type { CountdownSection } from './sections'

/**
 * Resolve the countdown target as an epoch-millisecond timestamp, or `null` when
 * there is nothing to count down to. `targetOverride` wins over the conference
 * start date. Bare `YYYY-MM-DD` values are anchored at 12:00 UTC (the house
 * anchoring convention — see {@link toOsloAnchoredDate}, whose name predates
 * the UTC-noon implementation) so the target does not drift with the viewer's
 * timezone; full ISO timestamps are used as-is. An unparseable
 * value resolves to `null` (the block then renders nothing).
 *
 * Pure and server-safe: the renderer calls this to pass a stable timestamp prop
 * into the client `Countdown`, keeping the countdown SSR-safe (no `Date.now()`
 * on the server render path).
 */
export function resolveCountdownTarget(
  conference: Pick<Conference, 'startDate'>,
  section: Pick<CountdownSection, 'targetOverride'>,
): number | null {
  const raw = section.targetOverride?.trim() || conference.startDate?.trim()
  if (!raw) return null
  const ms = toOsloAnchoredDate(raw).getTime()
  return Number.isNaN(ms) ? null : ms
}
