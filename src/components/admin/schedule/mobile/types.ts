import type React from 'react'
import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { ScheduleAction } from '@/lib/schedule/reducer'

export interface MobileScheduleViewProps {
  schedules: ConferenceSchedule[]
  currentDayIndex: number
  unassignedProposals: ProposalExisting[]
  dispatch: React.Dispatch<ScheduleAction>
  onDayChange: (dayIndex: number) => void
  onSave: () => void
  onAddTrack: () => void
  isSaving: boolean
  saveSuccess: boolean
  error: string | null
}

/**
 * A picked-up item awaiting a drop. Persists across track swipes, so dropping
 * into another track is "swipe, then tap a slot". A `scheduled` pick-up carries
 * the ORIGINAL `track.talks` index so reducer actions target the right slot.
 */
export type Placing =
  | {
      kind: 'scheduled'
      trackIndex: number
      talkIndex: number
      talk: TrackTalk
    }
  | { kind: 'proposal'; proposal: ProposalExisting }

/** The open interval a contextual "assign here" drawer was opened for. */
export interface SlotContext {
  trackIndex: number
  startTime: string
  maxDurationMin: number
}

export type SegmentState = 'default' | 'source' | 'valid' | 'invalid'

/** Which bottom sheet (if any) is currently open over the rail. */
export type ActiveSheet =
  | { kind: 'unassigned'; context: SlotContext | null }
  | { kind: 'track'; trackIndex: number }
  | {
      kind: 'card'
      trackIndex: number
      talkIndex: number
      talk: TrackTalk
    }
  | {
      kind: 'serviceEdit'
      trackIndex: number
      talkIndex: number
      talk: TrackTalk
      mode: 'rename' | 'duration'
    }
  | null
