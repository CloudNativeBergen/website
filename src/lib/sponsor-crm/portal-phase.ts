/**
 * Which post-signing block the sponsor portal shows (#1687, phase 7). Pure and
 * client-safe. Days are Oslo calendar days, compared as YYYY-MM-DD strings.
 *
 * - `signed`: the contract is signed, the event is more than 4 weeks away.
 * - `event`: from 28 days before `startDate` through the last day.
 * - `after`: the 90 days after `endDate`.
 * - `none`: not signed yet, or more than 90 days after the event.
 */
import { osloTodayDateString } from '@/lib/time'

export type PortalPhase = 'none' | 'signed' | 'event' | 'after'

export const EVENT_LEAD_DAYS = 28
export const AFTER_EVENT_DAYS = 90

export function isPortalSigned(sponsor: {
  contractStatus?: string | null
  signatureStatus?: string | null
}): boolean {
  return (
    sponsor.contractStatus === 'contract-signed' ||
    sponsor.signatureStatus === 'signed'
  )
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function portalPhase(
  sponsor: { contractStatus?: string | null; signatureStatus?: string | null },
  conference: { startDate?: string | null; endDate?: string | null },
  now: Date,
): PortalPhase {
  if (!isPortalSigned(sponsor)) return 'none'
  const start = conference.startDate?.slice(0, 10)
  const end = conference.endDate?.slice(0, 10) || start
  if (!start || !end) return 'signed'
  const today = osloTodayDateString(now)
  if (today < addDays(start, -EVENT_LEAD_DAYS)) return 'signed'
  if (today <= end) return 'event'
  if (today <= addDays(end, AFTER_EVENT_DAYS)) return 'after'
  return 'none'
}
