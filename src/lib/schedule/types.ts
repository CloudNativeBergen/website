import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'

export interface DropPosition {
  trackIndex: number
  timeSlot: string
}

export interface DragItem {
  type: 'proposal' | 'scheduled-talk' | 'service-session' | 'scheduled-service'
  proposal?: ProposalExisting
  serviceSession?: {
    placeholder: string
    startTime: string
    endTime: string
  }
  sourceTrackIndex?: number
  sourceTimeSlot?: string
}

export interface TimeSlot {
  time: string
  displayTime: string
}

export const DRAG_PERFORMANCE_THRESHOLD = 16
export const BATCH_UPDATE_DELAY = 100

const memoCache = new Map<string, number>()

export function getProposalDurationMinutes(proposal: ProposalExisting): number {
  const cacheKey = `duration-${proposal._id}-${proposal.format}`
  const cached = memoCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const split = proposal.format.split('_')
  let duration = 25

  if (split.length >= 2) {
    const parsed = parseInt(split[1], 10)
    if (!isNaN(parsed)) {
      duration = parsed
    }
  }

  memoCache.set(cacheKey, duration)
  return duration
}

export function generateTimeSlots(
  startTime: string = '08:00',
  endTime: string = '21:00',
  intervalMinutes: number = 5,
): TimeSlot[] {
  const slots: TimeSlot[] = []
  const start = new Date(`2000-01-01T${startTime}:00`)
  const end = new Date(`2000-01-01T${endTime}:00`)

  while (start <= end) {
    const timeString = start.toTimeString().slice(0, 5)
    slots.push({
      time: timeString,
      displayTime: timeString,
    })
    start.setMinutes(start.getMinutes() + intervalMinutes)
  }

  return slots
}

export function calculateEndTime(
  startTime: string,
  durationMinutes: number,
): string {
  const start = new Date(`2000-01-01T${startTime}:00`)
  start.setMinutes(start.getMinutes() + durationMinutes)
  return start.toTimeString().slice(0, 5)
}

export function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  const s1 = new Date(`2000-01-01T${start1}:00`)
  const e1 = new Date(`2000-01-01T${end1}:00`)
  const s2 = new Date(`2000-01-01T${start2}:00`)
  const e2 = new Date(`2000-01-01T${end2}:00`)

  return s1 < e2 && s2 < e1
}

export function findAvailableTimeSlot(
  track: ScheduleTrack,
  proposal: ProposalExisting,
  preferredStartTime?: string,
  excludeTalk?: { talkId: string; startTime: string },
): string | null {
  const durationMinutes = getProposalDurationMinutes(proposal)
  const startTime = preferredStartTime || '08:00'
  const proposalEndTime = calculateEndTime(startTime, durationMinutes)

  const hasConflict = track.talks.some((talk) => {
    if (!talk.talk) return false

    if (
      excludeTalk &&
      talk.talk._id === excludeTalk.talkId &&
      talk.startTime === excludeTalk.startTime
    ) {
      return false
    }

    return timesOverlap(
      startTime,
      proposalEndTime,
      talk.startTime,
      talk.endTime,
    )
  })

  return hasConflict ? null : startTime
}

export function canSwapTalks(
  track: ScheduleTrack,
  draggedProposal: ProposalExisting,
  targetTalk: TrackTalk,
  targetStartTime: string,
): boolean {
  if (!targetTalk.talk) return false

  const draggedDuration = getProposalDurationMinutes(draggedProposal)
  const draggedEndTime = calculateEndTime(targetStartTime, draggedDuration)

  const draggedHasConflict = track.talks.some((talk) => {
    if (!talk.talk) return false

    if (
      talk.talk._id === targetTalk.talk!._id &&
      talk.startTime === targetTalk.startTime
    ) {
      return false
    }

    return timesOverlap(
      targetStartTime,
      draggedEndTime,
      talk.startTime,
      talk.endTime,
    )
  })

  return !draggedHasConflict
}
