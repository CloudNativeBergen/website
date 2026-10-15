import type { ProposalWithWorkshopData } from '@/lib/workshop/types'

export interface WorkshopStats {
  confirmedCount: number
  waitlistCount: number
  /** Confirmed over capacity, capped at 100: the width of the utilization bar. */
  capacityPercentage: number
  /** The same ratio uncapped (107 for 32/30): the number the card prints. */
  utilizationPercentage: number
  /**
   * Confirmed seats beyond capacity, 0 at or below it (#1361). An organizer
   * can admit past capacity on purpose (#1344), and the card has to show
   * where that happened rather than read as a full `32/30`.
   */
  overCapacityBy: number
}

/**
 * Calculate workshop statistics for admin view
 * Note: This differs from base calculateWorkshopStats as it works with
 * confirmed/waitlist counts separately for admin filtering
 */
export function calculateWorkshopStats(
  workshop: ProposalWithWorkshopData,
  confirmedCount: number,
  waitlistCount: number,
): WorkshopStats {
  const capacity = workshop.capacity || 30
  const utilizationPercentage = Math.round((confirmedCount / capacity) * 100)

  return {
    confirmedCount,
    waitlistCount,
    capacityPercentage: Math.min(100, utilizationPercentage),
    utilizationPercentage,
    overCapacityBy: Math.max(0, confirmedCount - capacity),
  }
}

/**
 * Get capacity color class for admin workshop cards
 * Applies same color thresholds as base capacity logic:
 * < 30% = red (low attendance)
 * 30-70% = green (healthy attendance)
 * >= 70% = orange (filling up)
 */
export function getCapacityColorClass(percentage: number): string {
  let color: 'red' | 'green' | 'orange'

  if (percentage < 30) {
    color = 'red'
  } else if (percentage < 70) {
    color = 'green'
  } else {
    color = 'orange'
  }

  return `bg-${color}-500`
}
