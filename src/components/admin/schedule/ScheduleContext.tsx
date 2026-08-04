'use client'

import { createContext, useContext, type Dispatch } from 'react'
import type { DragItem, EditorSchedule } from '@/lib/schedule/types'
import type { ScheduleAction } from '@/lib/schedule/reducer'

/**
 * Ambient state for the schedule board, so the leaf drop targets
 * (`TimeSlotDropZone`, `ScheduledTalk`) can read the current drag and the whole
 * day WITHOUT being prop-drilled through `TracksGrid` → `DroppableTrack`.
 *
 * - `activeDragItem` — the item currently being dragged (null when idle).
 * - `schedule` — the whole current day, needed by `TimeSlotDropZone.canDrop` to
 *   validate the REVERSE half of a swap (see `rules.canPlaceDisplacedBack`).
 * - `otherScheduledProposalIds` — proposals scheduled on OTHER days, so
 *   `canDrop` applies the SAME cross-day duplicate guard as the reducer and can
 *   never light up a slot the reducer would then reject.
 * - `isReadOnly` — the board is showing the LIVE (official) schedule, which has
 *   no save path (autosave only runs in draft mode). Every interactive
 *   affordance (drag handles, resize handles, remove/rename buttons, the
 *   "＋ Service" hotspot) must hide itself when this is true, so edits can't
 *   accumulate as dirty state that is later wiped by the mode switch.
 * - `dispatch` — the reducer dispatch, so leaves can request mutations directly.
 *   It is already gated on `isReadOnly` by the editor (a no-op in live mode), so
 *   hiding the affordance and blocking the mutation are independent guards.
 */
interface ScheduleContextValue {
  activeDragItem: DragItem | null
  schedule: EditorSchedule | null
  otherScheduledProposalIds: ReadonlySet<string>
  isReadOnly: boolean
  dispatch: Dispatch<ScheduleAction>
}

const noop: Dispatch<ScheduleAction> = () => {}

const ScheduleContext = createContext<ScheduleContextValue>({
  activeDragItem: null,
  schedule: null,
  otherScheduledProposalIds: new Set(),
  isReadOnly: false,
  dispatch: noop,
})

export const ScheduleProvider = ScheduleContext.Provider

export function useScheduleContext(): ScheduleContextValue {
  return useContext(ScheduleContext)
}
