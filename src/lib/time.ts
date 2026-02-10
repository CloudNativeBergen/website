export function formatDate(dateString: string): string {
  if (!dateString) return 'TBD'

  const date = new Date(dateString)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateSafe(dateString: string): string {
  if (!dateString) return 'TBD'

  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid Date'

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    const month = months[date.getMonth()]
    const day = date.getDate()
    const year = date.getFullYear()

    return `${month} ${day}, ${year}`
  } catch (error) {
    console.error('Error formatting date:', error)
    return 'Invalid Date'
  }
}

export function formatDatesSafe(
  dateString1: string,
  dateString2: string,
): string {
  if (!dateString1 || !dateString2) return 'TBD'

  try {
    const date1 = new Date(dateString1)
    const date2 = new Date(dateString2)

    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      if (!isNaN(date1.getTime())) return formatDateSafe(dateString1)
      if (!isNaN(date2.getTime())) return formatDateSafe(dateString2)
      return 'Invalid Date Range'
    }

    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]

    const day1 = date1.getDate()
    const month1 = months[date1.getMonth()]
    const year1 = date1.getFullYear()

    const day2 = date2.getDate()
    const month2 = months[date2.getMonth()]
    const year2 = date2.getFullYear()

    if (dateString1 === dateString2) {
      return `${day1} ${month1} ${year1}`
    }
    if (year1 !== year2) {
      return `${day1} ${month1} ${year1} - ${day2} ${month2} ${year2}`
    }
    if (month1 !== month2) {
      return `${day1} ${month1} - ${day2} ${month2} ${year1}`
    }
    return `${day1} - ${day2} ${month1} ${year1}`
  } catch (error) {
    console.error('Error formatting date range:', error)
    const formatted1 = formatDateSafe(dateString1)
    const formatted2 = formatDateSafe(dateString2)
    if (formatted1 !== 'TBD' && formatted2 !== 'TBD') {
      return `${formatted1} - ${formatted2}`
    }
    return 'TBD'
  }
}

export function formatDateTimeSafe(dateString: string): string {
  if (!dateString) return 'TBD'

  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid Date'

    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]
    const month = months[date.getMonth()]
    const day = date.getDate()
    const year = date.getFullYear()

    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${month} ${day}, ${year} at ${hours}:${minutes}`
  } catch (error) {
    console.error('Error formatting date time:', error)
    return 'Invalid Date'
  }
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
  // Parse the date string (YYYY-MM-DD) components directly
  // to avoid timezone-related parsing issues
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return date.toLocaleDateString('en-US', {
    ...options,
    timeZone: 'Europe/Oslo',
  })
}

/**
 * Formats a date string with short format (e.g., "Mon, Oct 27")
 */
export function formatConferenceDateShort(dateString: string): string {
  return formatConferenceDate(dateString, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Formats a date string with long format (e.g., "Monday, October 27, 2025")
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
 * Formats a date string for badge display (e.g., "October 2025")
 * Shows only month and year without day or weekday
 */
export function formatConferenceDateForBadge(dateString: string): string {
  return formatConferenceDate(dateString, {
    year: 'numeric',
    month: 'long',
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

/**
 * Extracts the date portion from an ISO datetime string for date input fields.
 * @param isoDateTime ISO 8601 datetime string
 * @returns Date string in YYYY-MM-DD format
 */
export function extractDateFromISO(isoDateTime: string): string {
  return isoDateTime.split('T')[0]
}

/**
 * Extracts the time portion from an ISO datetime string for time input fields.
 * @param isoDateTime ISO 8601 datetime string
 * @returns Time string in HH:MM format
 */
export function extractTimeFromISO(isoDateTime: string): string {
  return isoDateTime.split('T')[1]?.slice(0, 5) || '00:00'
}

/**
 * Updates the date portion of an ISO datetime string while preserving the time.
 * @param isoDateTime Current ISO datetime string
 * @param newDate New date in YYYY-MM-DD format
 * @returns Updated ISO 8601 datetime string
 */
export function updateDateInISO(isoDateTime: string, newDate: string): string {
  const [, time] = isoDateTime.split('T')
  return `${newDate}T${time || '00:00:00.000Z'}`
}

/**
 * Updates the time portion of an ISO datetime string while preserving the date.
 * @param isoDateTime Current ISO datetime string
 * @param newTime New time in HH:MM format
 * @returns Updated ISO 8601 datetime string
 */
export function updateTimeInISO(isoDateTime: string, newTime: string): string {
  const [date] = isoDateTime.split('T')
  return `${date}T${newTime}:00.000Z`
}

/**
 * Converts EXIF datetime format to ISO 8601.
 * EXIF format: "YYYY:MM:DD HH:MM:SS"
 * @param exifDateTime EXIF datetime string
 * @returns ISO 8601 datetime string
 */
export function exifDateTimeToISO(exifDateTime: string): string {
  const match = exifDateTime.match(
    /(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
  )
  if (!match) {
    throw new Error('Invalid EXIF datetime format')
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`
}

/**
 * Converts 24-hour time format to 12-hour AM/PM format.
 * @param timeString Time in HH:MM format (e.g., "13:00")
 * @returns Formatted time in 12-hour format (e.g., "1:00 PM")
 */
export function formatTime12Hour(timeString: string): string {
  const [hours, minutes] = timeString.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${displayHour}:${minutes} ${ampm}`
}

/**
 * Formats an ISO date string as a human-readable relative time (e.g. "5 minutes ago").
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minutes ago`

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
