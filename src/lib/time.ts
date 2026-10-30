/**
 * House display locale for all UI-facing date formatting: Norwegian Bokmål.
 * Note: nb-NO renders weekday and month names in lowercase ("27. oktober 2025",
 * "mandag") — this is correct Norwegian orthography and is accepted as-is.
 */
export const HOUSE_LOCALE = 'nb-NO'

/** Conference timezone. All dates are anchored/rendered here. */
/**
 * The conference timezone. Every calendar date this platform stores — a CFP
 * deadline, a Campaign window, a Task's due day — is a day IN THIS ZONE, so
 * anything that turns an instant into a day, or a day into an instant, uses it.
 */
export const CONFERENCE_TIME_ZONE = 'Europe/Oslo'
const OSLO_TZ = CONFERENCE_TIME_ZONE

/**
 * True for a YYYY-MM-DD string that names a real calendar day. Shape alone is
 * not enough: `Date.UTC` silently rolls `2026-02-29` over to March 1, so a
 * shape-only check lets an impossible date through and any later arithmetic
 * quietly moves it. Both the conference write path and the marketing Milestone
 * resolver gate on this.
 */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value
}

/**
 * Today's calendar date in the conference timezone (Europe/Oslo) as
 * YYYY-MM-DD. Use for day-equality/ordering comparisons against stored
 * date-only strings so "today" doesn't shift with the viewer's timezone.
 */
export function osloTodayDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Lowercase Norwegian long month names (index = month number - 1). */
const NB_LONG_MONTHS = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
] as const

/**
 * Parses a date string so its calendar day is stable in Europe/Oslo regardless
 * of the viewer's timezone. Bare YYYY-MM-DD values are pinned to 12:00 UTC
 * (noon) — far enough from midnight that no real-world offset shifts the day
 * (the previous `new Date(y, m-1, d)` used LOCAL midnight, so viewers east of
 * Oslo saw the previous day and it hydration-mismatched). Full ISO timestamps
 * are parsed as-is since they already carry an offset.
 */
export function toOsloAnchoredDate(dateString: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
  if (dateOnly) {
    return new Date(
      Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
        12,
      ),
    )
  }
  return new Date(dateString)
}

/** Extracts and validates Y/M/D components from a bare YYYY-MM-DD string. */
function dateOnlyParts(
  dateString: string,
): { day: number; monthIndex: number; year: number } | null {
  // Anchored end-to-end: a timestamp like 2025-10-27T23:00:00Z must NOT match
  // (its calendar day depends on timezone; callers pass it down other paths).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
  if (!m) return null
  const year = Number(m[1])
  const monthIndex = Number(m[2]) - 1
  const day = Number(m[3])
  const probe = new Date(Date.UTC(year, monthIndex, day, 12))
  if (
    isNaN(probe.getTime()) ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== monthIndex ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return { day, monthIndex, year }
}

/**
 * Formats a date in the given BCP-47 locale (defaults to the nb-NO house
 * locale). Anchored to Europe/Oslo so the calendar day is stable across
 * viewer timezones. Use the `locale` override only for documents that must
 * follow their own language (e.g. English sponsor contracts).
 */
export function formatDateLocalized(
  dateString: string,
  locale: string = HOUSE_LOCALE,
): string {
  if (!dateString) return 'TBD'
  return toOsloAnchoredDate(dateString).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: OSLO_TZ,
  })
}

/** Formats a date in the house locale (e.g. "27. oktober 2025"). */
export function formatDate(dateString: string): string {
  return formatDateLocalized(dateString, HOUSE_LOCALE)
}

/** Compact date, house locale (e.g. "27. okt. 2025"). Safe for timestamps. */
export function formatDateSafe(dateString: string): string {
  if (!dateString) return 'TBD'

  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Invalid Date'

  return date.toLocaleDateString(HOUSE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: OSLO_TZ,
  })
}

/**
 * Formats a date range in the house locale, collapsing shared parts
 * (e.g. "27.–28. oktober 2025", "27. oktober – 5. november 2025").
 * Inputs are conference dates in YYYY-MM-DD form.
 */
export function formatDatesSafe(
  dateString1: string,
  dateString2: string,
): string {
  if (!dateString1 || !dateString2) return 'TBD'

  const p1 = dateOnlyParts(dateString1)
  const p2 = dateOnlyParts(dateString2)

  if (!p1 || !p2) {
    if (p1) return formatDateSafe(dateString1)
    if (p2) return formatDateSafe(dateString2)
    return 'Invalid Date Range'
  }

  const month1 = NB_LONG_MONTHS[p1.monthIndex]
  const month2 = NB_LONG_MONTHS[p2.monthIndex]

  if (dateString1 === dateString2) {
    return `${p1.day}. ${month1} ${p1.year}`
  }
  if (p1.year !== p2.year) {
    return `${p1.day}. ${month1} ${p1.year} – ${p2.day}. ${month2} ${p2.year}`
  }
  if (p1.monthIndex !== p2.monthIndex) {
    return `${p1.day}. ${month1} – ${p2.day}. ${month2} ${p1.year}`
  }
  return `${p1.day}.–${p2.day}. ${month1} ${p1.year}`
}

/**
 * Formats a date range in the given BCP-47 locale, letting `Intl` collapse the
 * shared parts the way that locale does (e.g. `en-GB` → "5–6 November 2026").
 *
 * Separate from {@link formatDatesSafe}, which hard-codes the Norwegian
 * "5.–6. november 2026" shape. Use this for documents that must read in their
 * own language — an English letter carrying a Norwegian date range is the kind
 * of detail a consulate notices.
 */
export function formatDateRangeLocalized(
  startDate: string,
  endDate: string,
  locale: string = HOUSE_LOCALE,
): string {
  if (!startDate || !endDate) return 'TBD'

  const start = toOsloAnchoredDate(startDate)
  const end = toOsloAnchoredDate(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime()))
    return 'Invalid Date Range'

  // A reversed range does not throw — `formatRange` happily renders
  // "6 – 5 November 2026", which is nonsense on a printed document. Order the
  // ends so the output always reads forward; dates stored the wrong way round
  // are a data problem to fix at the source, not to print.
  const [from, to] = start <= end ? [start, end] : [end, start]

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: OSLO_TZ,
  }).formatRange(from, to)
}

/**
 * A session's opening or closing instant for the attendee feedback page
 * (speaker feedback spec §7.2), e.g. "Tuesday 27 October at 10:40": English,
 * the conference's time zone, a 24-hour clock like the programme, no year.
 */
export function formatSessionInstant(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: CONFERENCE_TIME_ZONE,
  })
}

/**
 * A moment on a conference day, e.g. "Tue 27 Oct, 10:52": the conference's
 * time zone, a 24-hour clock like the programme, no year. When a feedback
 * comment arrived (speaker feedback spec §9.3), when a Wall Post was
 * submitted (Photo Wall spec §10).
 */
export function formatConferenceDayTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: CONFERENCE_TIME_ZONE,
  })
}

/**
 * A conference calendar date (YYYY-MM-DD), e.g. "Tue 27 Oct": English, no
 * year, matching {@link formatConferenceDayTime}.
 */
export function formatConferenceDayDate(dateString: string): string {
  return toOsloAnchoredDate(dateString).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: CONFERENCE_TIME_ZONE,
  })
}

/**
 * A clock time in the conference's time zone, e.g. "10:50": the end of a
 * range whose start {@link formatConferenceDayTime} gave the day of.
 */
export function formatConferenceClock(value: string): string {
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: CONFERENCE_TIME_ZONE,
  })
}

/**
 * A workshop registration opening or closing instant, in English and in the
 * conference's time zone (e.g. "Thursday, October 1, 2026 at 10:00 AM"). The
 * /workshop page and the sign-up instructions email both use it, so an
 * attendee reads the same time in each, and the server's own zone never
 * leaks in.
 */
export function formatRegistrationInstant(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: CONFERENCE_TIME_ZONE,
  })
}

/** Formats a timestamp with time, house locale (e.g. "27. oktober 2025, 14:30"). */
export function formatDateTimeSafe(dateString: string): string {
  if (!dateString) return 'TBD'

  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Invalid Date'

  return date.toLocaleString(HOUSE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: OSLO_TZ,
  })
}

/**
 * Conference schedule date formatting utilities.
 *
 * All dates from Sanity are in YYYY-MM-DD format and represent dates
 * in the conference timezone (Europe/Oslo). These utilities ensure
 * dates are displayed consistently regardless of the user's timezone.
 */

/**
 * Formats a date string for display, ensuring it's interpreted in Oslo timezone.
 * @param dateString Date in YYYY-MM-DD format
 * @param options Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date string
 */
export function formatConferenceDate(
  dateString: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  },
): string {
  // Anchor bare YYYY-MM-DD at 12:00 UTC so the calendar day is stable in every
  // viewer timezone, then render in the conference timezone (Europe/Oslo).
  return toOsloAnchoredDate(dateString).toLocaleDateString(HOUSE_LOCALE, {
    ...options,
    timeZone: OSLO_TZ,
  })
}

/**
 * Formats a date string with short format (e.g., "man. 27. okt.")
 */
export function formatConferenceDateShort(dateString: string): string {
  return formatConferenceDate(dateString, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Formats a date string with long format (e.g., "mandag 27. oktober 2025")
 */
export function formatConferenceDateLong(dateString: string): string {
  return formatConferenceDate(dateString, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Formats a date string for badge display (e.g., "oktober 2025")
 * Shows only month and year without day or weekday
 */
export function formatConferenceDateForBadge(dateString: string): string {
  return formatConferenceDate(dateString, {
    year: 'numeric',
    month: 'long',
  })
}

/**
 * Compact month label for chart axes/trends (e.g. "okt"), house locale.
 * Pairs with formatChartDay for two-line labels in narrow chart columns.
 */
export function formatChartMonth(dateString: string): string {
  return toOsloAnchoredDate(dateString).toLocaleDateString(HOUSE_LOCALE, {
    month: 'short',
    timeZone: OSLO_TZ,
  })
}

/**
 * Bare day-of-month label for chart axes/trends (e.g. "27"), Oslo-anchored.
 * Extracted via formatToParts because nb-NO renders a standalone numeric day
 * with a trailing period ("27.") which reads as noise on a chart axis.
 */
export function formatChartDay(dateString: string): string {
  const parts = new Intl.DateTimeFormat(HOUSE_LOCALE, {
    day: 'numeric',
    timeZone: OSLO_TZ,
  }).formatToParts(toOsloAnchoredDate(dateString))
  return parts.find((p) => p.type === 'day')?.value ?? ''
}

/** Single-line compact chart date label (e.g. "27. okt."), house locale. */
export function formatChartDateShort(dateString: string): string {
  return toOsloAnchoredDate(dateString).toLocaleDateString(HOUSE_LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: OSLO_TZ,
  })
}

/**
 * Gallery datetime utilities
 * These functions handle datetime operations for the gallery feature,
 * ensuring consistent datetime handling across upload, display, and editing.
 */

/**
 * Gets the current datetime as an ISO 8601 string.
 * @returns ISO 8601 datetime string (e.g., "2025-10-30T14:30:00.000Z")
 */
export function getCurrentDateTime(): string {
  return new Date().toISOString()
}

/**
 * Converts a file's last modified timestamp to ISO 8601 datetime string.
 * Used as fallback when EXIF data is not available.
 * @param file File object
 * @returns ISO 8601 datetime string
 */
export function fileTimestampToISO(file: File): string {
  return new Date(file.lastModified).toISOString()
}

// Gallery photo times are instants (UTC ISO). The date/time inputs show and
// accept Europe/Oslo wall-clock, so the helpers below convert both ways.

/** Oslo `YYYY-MM-DDTHH:MM` for an instant, or the raw parts for anything else. */
function osloInputParts(isoDateTime: string): [string, string] {
  const local = isoDateTime.includes('T')
    ? instantToOsloLocalInput(isoDateTime)
    : ''
  const [date, time] = (local || isoDateTime).split('T')
  return [date, time?.slice(0, 5) || '00:00']
}

/**
 * Europe/Oslo calendar date (YYYY-MM-DD) of an ISO instant, for date inputs.
 * A bare date is returned as-is.
 */
export function extractDateFromISO(isoDateTime: string): string {
  return osloInputParts(isoDateTime)[0]
}

/** Europe/Oslo wall-clock time (HH:MM) of an ISO instant, for time inputs. */
export function extractTimeFromISO(isoDateTime: string): string {
  return osloInputParts(isoDateTime)[1]
}

/** Replaces the Oslo date of an instant, keeping its Oslo time. */
export function updateDateInISO(isoDateTime: string, newDate: string): string {
  const [, time] = osloInputParts(isoDateTime)
  return osloLocalInputToIso(`${newDate}T${time}`) ?? isoDateTime
}

/** Replaces the Oslo time (HH:MM) of an instant, keeping its Oslo date. */
export function updateTimeInISO(isoDateTime: string, newTime: string): string {
  const [date] = osloInputParts(isoDateTime)
  return osloLocalInputToIso(`${date}T${newTime}`) ?? isoDateTime
}

/**
 * Converts EXIF datetime ("YYYY:MM:DD HH:MM:SS", camera wall-clock with no
 * zone) to an ISO instant, reading it as Europe/Oslo time.
 */
export function exifDateTimeToISO(exifDateTime: string): string {
  const match = exifDateTime.match(
    /(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
  )
  if (!match) {
    throw new Error('Invalid EXIF datetime format')
  }
  const iso = osloLocalInputToIso(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`,
  )
  if (!iso) throw new Error('Invalid EXIF datetime format')
  return new Date(Date.parse(iso) + Number(match[6]) * 1000).toISOString()
}

/**
 * Formats an ISO date string as a human-readable relative time (e.g. "5 minutes ago").
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()

  if (isNaN(then)) return ''

  const diffMs = now - then

  if (diffMs < 0) return 'just now'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`

  const weeks = Math.floor(days / 7)
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`
}

/**
 * Formats a snake_case or lowercase string into Title Case (e.g. "lightning_talk" → "Lightning Talk").
 */
export function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Wall-clock parts of an instant in Europe/Oslo (DST-correct, via Intl),
 * assembled from formatToParts values — never from a locale-formatted string.
 */
function osloParts(instant: Date): {
  date: string
  time: string
} {
  // formatToParts, not format(): the assembled string's separators are not
  // guaranteed across engines, but part values are.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OSLO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const time = `${get('hour')}:${get('minute')}`
  return { date, time }
}

/** Millisecond offset of Europe/Oslo from UTC at the given instant. */
function osloOffsetMs(instant: Date): number {
  const { date, time } = osloParts(instant)
  const asUtc = Date.parse(`${date}T${time}:00Z`)
  // Truncate the instant to the minute the parts represent before comparing.
  const truncated = Math.floor(instant.getTime() / 60_000) * 60_000
  return asUtc - truncated
}

/**
 * Stored ISO instant → the Europe/Oslo wall-clock string a `datetime-local`
 * input should DISPLAY, so edit fields agree with the read-only views (which
 * format via {@link formatDateTimeSafe} in Oslo time) regardless of the
 * admin's own timezone.
 */
export function instantToOsloLocalInput(value?: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const { date, time } = osloParts(d)
  return `${date}T${time}`
}

/**
 * A `datetime-local` string ENTERED AS Europe/Oslo wall-clock → the ISO
 * instant to persist. DST-correct: the offset is resolved at the target
 * instant (with one re-check across a transition boundary).
 */
export function osloLocalInputToIso(value?: string): string | null {
  const v = value?.trim()
  if (!v) return null
  // Strict datetime-local shape only — engines parse surprising strings
  // leniently (e.g. bare years), which must not silently become instants.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null
  const naiveUtc = Date.parse(`${v}:00Z`)
  if (Number.isNaN(naiveUtc)) return null
  let instant = naiveUtc - osloOffsetMs(new Date(naiveUtc))
  const secondPass = naiveUtc - osloOffsetMs(new Date(instant))
  if (secondPass !== instant) instant = secondPass
  return new Date(instant).toISOString()
}
