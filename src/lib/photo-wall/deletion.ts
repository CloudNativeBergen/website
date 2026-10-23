/**
 * THE DELETION DATE (Photo Wall spec §11.1): the conference's `endDate` plus
 * 30 days, on the calendar. Pure, so the consent line (M2) and the cookie's
 * expiry (§6.1) agree on the day without either computing it.
 */
import { isCalendarDate, osloLocalInputToIso } from '@/lib/time'

export const DELETION_DAYS = 30

/** `YYYY-MM-DD`, or null for a conference without a usable end date. */
export function deletionDate(
  endDate: string | null | undefined,
): string | null {
  if (!endDate || !isCalendarDate(endDate)) return null
  const [y, m, d] = endDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + DELETION_DAYS))
    .toISOString()
    .slice(0, 10)
}

/**
 * The last second of the deletion date, 23:59:59 Europe/Oslo: when the
 * device cookie expires. Null without a usable end date.
 */
export function deletionDateEnd(
  endDate: string | null | undefined,
): Date | null {
  const date = deletionDate(endDate)
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  const midnight = osloLocalInputToIso(`${next}T00:00`)
  return midnight ? new Date(Date.parse(midnight) - 1000) : null
}
