import {
  ConferenceSchedule,
  ScheduleTrack,
} from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'

export interface DropPosition {
  trackIndex: number
  timeSlot: string
}

export interface DragItem {
  type: 'proposal' | 'scheduled-talk'
  proposal: ProposalExisting
  sourceTrackIndex?: number
  sourceTimeSlot?: string
}

export interface TimeSlot {
  time: string
  displayTime: string
}

export interface ScheduleState {
  schedule: ConferenceSchedule | null
  unassignedProposals: ProposalExisting[]
}

// Helper to convert minutes to pixels (for visual representation)
export const MINUTES_TO_PIXELS = 2.4

// Helper to get proposal duration in minutes
export function getProposalDurationMinutes(proposal: ProposalExisting): number {
  switch (proposal.format) {
    case 'lightning_10':
      return 10
    case 'presentation_20':
      return 20
    case 'presentation_25':
      return 25
    case 'presentation_40':
      return 40
    case 'presentation_45':
      return 45
    case 'workshop_120':
      return 120
    case 'workshop_240':
      return 240
    default:
      return 25 // Default duration
  }
}

// Helper to generate time slots for a day
export function generateTimeSlots(
  startTime: string = '09:00',
  endTime: string = '17:00',
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

// Helper to calculate end time based on start time and duration
export function calculateEndTime(
  startTime: string,
  durationMinutes: number,
): string {
  const start = new Date(`2000-01-01T${startTime}:00`)
  start.setMinutes(start.getMinutes() + durationMinutes)
  return start.toTimeString().slice(0, 5)
}

// Helper to check if two time ranges overlap
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

// Helper to find available time slot in a track
export function findAvailableTimeSlot(
  track: ScheduleTrack,
  proposal: ProposalExisting,
  preferredStartTime?: string,
  excludeTalk?: { talkId: string; startTime: string },
): string | null {
  const durationMinutes = getProposalDurationMinutes(proposal)
  const startTime = preferredStartTime || '09:00'
  const proposalEndTime = calculateEndTime(startTime, durationMinutes)

  // Check if proposed time conflicts with existing talks
  const hasConflict = track.talks.some((talk) => {
    if (!talk.talk) return false

    // Exclude the talk being moved to prevent self-conflict
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
