/**
 * The capacity notice: organizers are told when a workshop is 80% full and
 * when its waitlist starts. Raised by `./seats` after a write that changes the
 * seats has committed; the notification is written by the bus handler
 * (`@/lib/events/handlers/workshopCapacityNotification`), once per workshop,
 * threshold and organizer, by its document id.
 */
import { eventBus } from '@/lib/events/bus'
import type { WorkshopCapacityThreshold } from '@/lib/events/types'
import { runAfterResponse } from '@/server/runAfterResponse'

export interface SeatState {
  seatsTaken: number
  capacity: number
  waitlist: boolean
}

const eightyPercent = ({ seatsTaken, capacity }: SeatState) =>
  capacity > 0 && seatsTaken * 5 >= capacity * 4

/**
 * The thresholds a write crossed. Only a crossing raises one, so a workshop
 * that stays above 80% costs no read or write per sign-up; one that crosses
 * again after a cancel is held to one notification by the document id.
 */
export function crossedThresholds(
  before: SeatState,
  after: SeatState,
): WorkshopCapacityThreshold[] {
  const crossed: WorkshopCapacityThreshold[] = []
  if (eightyPercent(after) && !eightyPercent(before)) {
    crossed.push('eighty-percent')
  }
  if (after.waitlist && !before.waitlist) crossed.push('waitlist')
  return crossed
}

/**
 * Publishes one event per crossed threshold, after the response. NEVER
 * THROWS: the write has committed, and its answer must not change.
 */
export function reportCapacityThresholds(params: {
  conferenceId: string
  workshopId: string
  workshopTitle: string
  before: SeatState
  after: SeatState
}): void {
  try {
    const { conferenceId, workshopId, workshopTitle, before, after } = params
    const crossed = crossedThresholds(before, after)
    if (crossed.length === 0) return
    runAfterResponse(async () => {
      // Loaded here, as in `./not-set-notice`: the registry is every handler.
      await import('@/lib/events/registry')
      for (const threshold of crossed) {
        await eventBus.publish({
          eventType: 'workshop.capacity.threshold',
          timestamp: new Date(),
          conferenceId,
          workshopId,
          workshopTitle,
          threshold,
          seatsTaken: after.seatsTaken,
          capacity: after.capacity,
        })
      }
    })
  } catch (error) {
    console.error('workshop.capacity.threshold: could not be raised', error)
  }
}
