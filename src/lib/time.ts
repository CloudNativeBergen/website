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
