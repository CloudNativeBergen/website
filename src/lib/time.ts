export function formatDate(dateString: string): string {
  if (!dateString) return 'TBD'

  const date = new Date(dateString)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDates(dateString1: string, dateString2: string): string {
  if (!dateString1 || !dateString2) return 'TBD'

  try {
    const date1 = new Date(dateString1)
    const date2 = new Date(dateString2)

    // Check for invalid dates
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      // Try formatting individually if one is valid
      if (!isNaN(date1.getTime())) return formatDate(dateString1)
      if (!isNaN(date2.getTime())) return formatDate(dateString2)
      return 'Invalid Date Range'
    }

    const day1 = date1.toLocaleDateString('en-GB', { day: 'numeric' })
    const month1 = date1.toLocaleDateString('en-GB', { month: 'long' })
    const year1 = date1.toLocaleDateString('en-GB', { year: 'numeric' })

    const day2 = date2.toLocaleDateString('en-GB', { day: 'numeric' })
    const month2 = date2.toLocaleDateString('en-GB', { month: 'long' })
    const year2 = date2.toLocaleDateString('en-GB', { year: 'numeric' })

    if (year1 !== year2) {
      // Different years: 10 December 2024 - 1 January 2025
      return `${day1} ${month1} ${year1} - ${day2} ${month2} ${year2}`
    }
    // Same year
    if (month1 !== month2) {
      // Different months: 30 September - 1 October 2024
      return `${day1} ${month1} - ${day2} ${month2} ${year1}`
    }
    // Same month and year: 10 - 11 September 2024
    return `${day1} - ${day2} ${month1} ${year1}`
  } catch (error) {
    console.error('Error formatting date range:', error)
    // Fallback to individual formatting or TBD
    const formatted1 = formatDate(dateString1)
    const formatted2 = formatDate(dateString2)
    if (formatted1 !== 'TBD' && formatted2 !== 'TBD') {
      return `${formatted1} - ${formatted2}`
    }
    return 'TBD'
  }
}
