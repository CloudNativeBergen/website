/**
 * THE DELETION DATE (Photo Wall spec §11.1): the conference's `endDate` plus
 * 30 days, on the calendar. Pure, so the consent line (M2) and the cookie's
 * expiry (§6.1) agree on the day without either computing it.
 */
import { isCalendarDate, osloLocalInputToIso } from '@/lib/time'

export const DELETION_DAYS = 30

/** A calendar date (`YYYY-MM-DD`) plus `days`, on the calendar. */
export function plusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** `YYYY-MM-DD`, or null for a conference without a usable end date. */
export function deletionDate(
  endDate: string | null | undefined,
): string | null {
  if (!endDate || !isCalendarDate(endDate)) return null
  return plusDays(endDate, DELETION_DAYS)
}

/**
 * The last second of the deletion date, 23:59:59 Europe/Oslo: when the
 * device cookie expires. Null without a usable end date.
 */
export function deletionDateEnd(
  endDate: string | null | undefined,
): Date | null {
  if (!endDate || !isCalendarDate(endDate)) return null
  // The day AFTER the deletion date, at Oslo midnight, less one second.
  const next = plusDays(endDate, DELETION_DAYS + 1)
  const midnight = osloLocalInputToIso(`${next}T00:00`)
  return midnight ? new Date(Date.parse(midnight) - 1000) : null
}
