'use client'

import { createContext, useContext, type Dispatch } from 'react'
import type { ConferenceSchedule } from '@/lib/conference/types'
import type { DragItem } from '@/lib/schedule/types'
import type { ScheduleAction } from '@/lib/schedule/reducer'

/**
 * Ambient state for the schedule board, so the leaf drop targets
 * (`TimeSlotDropZone`, `ScheduledTalk`) can read the current drag and the whole
 * day WITHOUT being prop-drilled through `TracksGrid` → `DroppableTrack`.
 *
 * - `activeDragItem` — the item currently being dragged (null when idle).
 * - `schedule` — the whole current day, needed by `TimeSlotDropZone.canDrop` to
 *   validate the REVERSE half of a swap (see `rules.canPlaceDisplacedBack`).
 * - `dispatch` — the reducer dispatch, so leaves can request mutations directly.
 */
interface ScheduleContextValue {
  activeDragItem: DragItem | null
  schedule: ConferenceSchedule | null
  dispatch: Dispatch<ScheduleAction>
}

const noop: Dispatch<ScheduleAction> = () => {}

const ScheduleContext = createContext<ScheduleContextValue>({
  activeDragItem: null,
  schedule: null,
  dispatch: noop,
})

export const ScheduleProvider = ScheduleContext.Provider

export function useScheduleContext(): ScheduleContextValue {
  return useContext(ScheduleContext)
}
