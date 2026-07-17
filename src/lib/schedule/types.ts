import { ProposalExisting } from '@/lib/proposal/types'

// Pure time helpers live in ./time and placement rules in ./rules. Re-exported
// here so existing importers (`@/lib/schedule/types`) keep working while the
// module is split up.
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
export {
  findAvailableTimeSlot,
  canSwapTalks,
  canPlaceDisplacedBack,
  isTrackIntervalFree,
  fitsInTrack,
  matchTalk,
  matchService,
} from './rules'

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
