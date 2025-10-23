import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { calculateCapacityPercentage } from '@/lib/workshop/capacity'

export interface WorkshopStats {
  confirmedCount: number
  waitlistCount: number
  capacityPercentage: number
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
  const capacityPercentage = calculateCapacityPercentage(
    capacity,
    confirmedCount,
  )

  return {
    confirmedCount,
    waitlistCount,
    capacityPercentage,
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
