import type { ProposalWithWorkshopData } from '@/lib/workshop/types'

export interface WorkshopStats {
  confirmedCount: number
  waitlistCount: number
  capacityPercentage: number
}

export function calculateWorkshopStats(
  workshop: ProposalWithWorkshopData,
  confirmedCount: number,
  waitlistCount: number,
): WorkshopStats {
  const capacity = workshop.capacity || 30
  const capacityPercentage = (confirmedCount / capacity) * 100

  return {
    confirmedCount,
    waitlistCount,
    capacityPercentage,
  }
}

export function getCapacityColorClass(percentage: number): string {
  if (percentage < 30) return 'bg-red-500'
  if (percentage >= 70) return 'bg-orange-500'
  return 'bg-green-500'
}

export function getCapacityStatusColor(
  percentage: number,
): 'green' | 'orange' | 'red' {
  if (percentage < 30) return 'red'
  if (percentage >= 70) return 'orange'
  return 'green'
}
