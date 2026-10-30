/**
 * Pure planning for migration 056. Before #1735 the gallery helpers in
 * src/lib/time.ts wrote an Oslo wall-clock time with a `Z` suffix, so EXIF
 * times and manually edited times are 1 h (winter) or 2 h (summer) late.
 *
 * Nothing on the document records where `date` came from, so this tells the
 * sources apart by shape:
 *   - `fileTimestampToISO` and `getCurrentDateTime` produce a real instant
 *     with millisecond precision. These were always correct.
 *   - `exifDateTimeToISO` and `updateTimeInISO` always write `.000Z`.
 * A value with non-zero milliseconds is therefore left alone. A file
 * timestamp that happens to land on `.000` (1 in 1000, or a filesystem that
 * stores whole seconds) is indistinguishable and would be shifted; the
 * dry-run lists every candidate so those can be excluded by id.
 */

export const FIXED_FIELD = 'dateBeforeTzFix'

export type GalleryDoc = {
  _id: string
  _rev: string
  _updatedAt: string
  date?: string
  dateBeforeTzFix?: string
  conference?: { _ref?: string }
}

export type Plan =
  | { action: 'shift'; oldValue: string; newValue: string; offset: string }
  | { action: 'skip'; reason: string }
  | { action: 'review'; reason: string }

const osloFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Oslo',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Europe/Oslo offset from UTC, in ms, at the given instant. */
export function osloOffsetMs(instantMs: number): number {
  const p = Object.fromEntries(
    osloFormat.formatToParts(new Date(instantMs)).map((x) => [x.type, x.value]),
  )
  const asUtc = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  )
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * Reads the stored value's UTC fields as an Oslo wall-clock time and returns
 * the real instant. Same two-pass resolution as `osloLocalInputToIso`.
 */
export function wallClockAsOslo(stored: string): string {
  const naive = Date.parse(stored)
  let instant = naive - osloOffsetMs(naive)
  const second = naive - osloOffsetMs(instant)
  if (second !== instant) instant = second
  return new Date(instant).toISOString()
}

export function planDoc(
  doc: GalleryDoc,
  cutoff: string,
  excluded: ReadonlySet<string>,
): Plan {
  if (doc._id.startsWith('drafts.')) return { action: 'skip', reason: 'draft' }
  if (doc[FIXED_FIELD] !== undefined)
    return { action: 'skip', reason: 'already migrated' }
  if (excluded.has(doc._id)) return { action: 'skip', reason: 'excluded' }
  const stored = doc.date
  if (!stored || Number.isNaN(Date.parse(stored)))
    return { action: 'skip', reason: 'no valid date' }
  if (!/\.000Z$/.test(stored))
    return { action: 'skip', reason: 'file timestamp (ms precision)' }
  if (Date.parse(doc._updatedAt) >= Date.parse(cutoff))
    return {
      action: 'review',
      reason: `edited after the cutoff (${doc._updatedAt}); may already be correct`,
    }
  const newValue = wallClockAsOslo(stored)
  const hours = (Date.parse(stored) - Date.parse(newValue)) / 3_600_000
  return { action: 'shift', oldValue: stored, newValue, offset: `-${hours}h` }
}
