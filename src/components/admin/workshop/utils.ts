import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { getWorkshopDateTime } from '@/lib/workshop/utils'

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

export interface WorkshopScheduleDay<T> {
  date: string
  tracks: string[]
  /** Rows by start time; each row holds one cell per track, in `tracks` order; a cell
   * holds every workshop booked there, so a double booking shows. */
  slots: { startTime: string; endTime?: string; cells: T[][] }[]
}

/**
 * Lays workshops out like the program grid: one column per track (room), one
 * row per start time, per day. Workshops without a date, track or start time
 * are returned in `unscheduled` so they never drop off the admin page.
 */
export function groupWorkshopsBySchedule<T extends ProposalWithWorkshopData>(
  workshops: T[],
): { days: WorkshopScheduleDay<T>[]; unscheduled: T[] } {
  type Placed = {
    w: T
    date: string
    room: string
    start: string
    end?: string
  }
  const unscheduled: T[] = []
  const byDay = new Map<string, Placed[]>()
  for (const w of workshops) {
    // The track a workshop sits in on the schedule is its room.
    const { date, startTime, endTime, room } = getWorkshopDateTime(w)
    if (!date || !room || !startTime) {
      unscheduled.push(w)
      continue
    }
    const placed = { w, date, room, start: startTime, end: endTime }
    byDay.set(date, [...(byDay.get(date) ?? []), placed])
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const tracks = [...new Set(list.map((p) => p.room))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      )
      const times = [...new Set(list.map((p) => p.start))].sort()
      const slots = times.map((startTime) => {
        const inSlot = list.filter((p) => p.start === startTime)
        // A row shows one end time only when its workshops agree on it.
        const ends = new Set(inSlot.map((p) => p.end))
        return {
          startTime,
          endTime: ends.size === 1 ? [...ends][0] : undefined,
          cells: tracks.map((t) =>
            inSlot.filter((p) => p.room === t).map((p) => p.w),
          ),
        }
      })
      return { date, tracks, slots }
    })

  return { days, unscheduled }
}
