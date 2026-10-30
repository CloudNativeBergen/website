/**
 * Moves a gallery photo to the event day while keeping its Oslo clock time.
 *
 * Cloud Native Day Bergen 2024 ran on 30 October 2024, but its 293 photos are
 * dated 6–7 November: the time they were imported, not when they were taken.
 * The organizers chose to keep each photo's Oslo time of day and only replace
 * the date. 30 October 2024 is after the DST change (27 October), so Oslo is
 * UTC+01:00 on the target day.
 */

export const EVENT_DAY = '2024-10-30'
export const EVENT_DAY_UTC_OFFSET_MINUTES = 60
export const MARKER_FIELD = 'dateBeforeEventDayFix'

export interface GalleryDoc {
  _id: string
  _rev: string
  date?: string
  conference?: { _ref?: string }
  [MARKER_FIELD]?: string
}

export type Plan =
  | { action: 'skip'; reason: string }
  | { action: 'move'; oldValue: string; newValue: string }

const osloParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  }
}

export function planDoc(doc: GalleryDoc): Plan {
  if (doc._id.startsWith('drafts.')) return { action: 'skip', reason: 'draft' }
  if (doc[MARKER_FIELD]) return { action: 'skip', reason: 'already moved' }
  if (!doc.date || Number.isNaN(Date.parse(doc.date)))
    return { action: 'skip', reason: 'no date' }

  const { date, time } = osloParts(doc.date)
  if (date === EVENT_DAY) return { action: 'skip', reason: 'on event day' }

  const ms = doc.date.match(/\.(\d{3})Z$/)?.[1] ?? '000'
  const [h, m, s] = time.split(':').map(Number)
  const utc =
    Date.UTC(2024, 9, 30, h, m, s) - EVENT_DAY_UTC_OFFSET_MINUTES * 60_000
  const newValue = new Date(utc).toISOString().replace(/\.\d{3}Z$/, `.${ms}Z`)
  return { action: 'move', oldValue: doc.date, newValue }
}
