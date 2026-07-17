import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import {
  calculateEndTime,
  getProposalDurationMinutes,
  timesOverlap,
} from './time'

// Pure time helpers now live in ./time. Re-exported here so existing importers
// (`@/lib/schedule/types`) keep working while the module is split up.
export {
  toMinutes,
  toHHMM,
  addMinutes,
  durationBetween,
  calculateEndTime,
  timesOverlap,
  generateTimeSlots,
  getProposalDurationMinutes,
  type TimeSlot,
} from './time'

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

export const DRAG_PERFORMANCE_THRESHOLD = 16
export const BATCH_UPDATE_DELAY = 100

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
