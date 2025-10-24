/**
 * Workshop capacity calculation utilities
 *
 * These functions provide reusable logic for workshop capacity management,
 * including availability checks, percentage calculations, and status messaging.
 *
 * Currently used in:
 * - WorkshopCard (public): getCapacityStatusMessage
 * - admin/workshop/utils: calculateCapacityPercentage, getCapacityStatusColor
 * - Internal: calculateAvailableSpots, isWorkshopFull (used by other functions)
 */

/**
 * Calculate the number of available spots in a workshop
 * Used internally by other capacity functions
 */
export function calculateAvailableSpots(
  capacity: number,
  signups: number,
): number {
  return Math.max(0, capacity - signups)
}

/**
 * Check if a workshop is full (no available spots)
 */
export function isWorkshopFull(capacity: number, signups: number): boolean {
  return signups >= capacity
}

/**
 * Calculate the capacity percentage (0-100)
 */
export function calculateCapacityPercentage(
  capacity: number,
  signups: number,
): number {
  if (capacity === 0) return 0
  return Math.min(100, Math.round((signups / capacity) * 100))
}

/**
 * Get capacity status color based on thresholds
 * For workshops: low signups are concerning, high signups are good
 * < 30% = red (low attendance)
 * 30-70% = green (healthy attendance)
 * >= 70% = orange (filling up)
 */
export function getCapacityStatusColor(
  capacity: number,
  signups: number,
): 'red' | 'green' | 'orange' {
  const percentage = calculateCapacityPercentage(capacity, signups)

  if (percentage < 30) return 'red'
  if (percentage < 70) return 'green'
  return 'orange'
}

/**
 * Get a human-readable capacity status message
 */
export function getCapacityStatusMessage(
  capacity: number,
  signups: number,
): string {
  const available = calculateAvailableSpots(capacity, signups)
  const percentage = calculateCapacityPercentage(capacity, signups)

  if (available === 0) {
    return 'Workshop is full'
  }

  if (available === 1) {
    return '1 spot remaining'
  }

  if (percentage >= 70) {
    return `${available} spots remaining - filling up fast!`
  }

  return `${available} spots available`
}
