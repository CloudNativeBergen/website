'use client'

import { useCallback, useMemo } from 'react'
import { TrackTalk } from '@/lib/conference/types'
import { ArrowsRightLeftIcon, TrashIcon } from '@heroicons/react/24/outline'
import { calculateTalkPosition } from '@/lib/schedule/geometry'
import { DraggableProposal } from '../DraggableProposal'
import { useScheduleContext } from '../ScheduleContext'

export const ScheduledTalk = ({
  talk,
  talkIndex,
  trackIndex,
  hoveredSwapTimeSlot,
}: {
  talk: TrackTalk
  talkIndex: number
  trackIndex: number
  hoveredSwapTimeSlot?: string | null
}) => {
  // `activeDragItem` (swap highlight) and `dispatch` (remove) come from context
  // instead of being prop-drilled through TracksGrid → DroppableTrack.
  const { activeDragItem, dispatch } = useScheduleContext()

  const position = useMemo(() => calculateTalkPosition(talk), [talk])

  const handleRemove = useCallback(() => {
    dispatch({ type: 'removeTalk', trackIndex, talkIndex })
  }, [dispatch, trackIndex, talkIndex])

  const isSwapTarget = useMemo(() => {
    if (!activeDragItem?.proposal || !talk.talk || !hoveredSwapTimeSlot)
      return false

    if (activeDragItem.type !== 'scheduled-talk') return false

    if (
      activeDragItem.proposal._id === talk.talk._id &&
      activeDragItem.sourceTimeSlot === talk.startTime
    ) {
      return false
    }

    return talk.startTime === hoveredSwapTimeSlot
  }, [activeDragItem, talk.talk, talk.startTime, hoveredSwapTimeSlot])

  if (!talk.talk) return null

  return (
    <div
      key={`${talk.talk._id}-${talk.startTime}`}
      className={`group absolute right-2 left-2 z-10 transition-all duration-200 ${
        isSwapTarget ? 'animate-pulse' : ''
      }`}
      style={{
        top: `${position.top}px`,
        height: `${position.height}px`,
      }}
    >
      <div
        className={`relative h-full transition-all duration-200 ${
          isSwapTarget
            ? 'scale-105 transform shadow-lg ring-2 ring-amber-400/75'
            : ''
        }`}
      >
        <DraggableProposal
          proposal={talk.talk}
          sourceTrackIndex={trackIndex}
          sourceTimeSlot={talk.startTime}
          isDragging={isSwapTarget}
        />
        {isSwapTarget && (
          <div className="absolute -top-2 -right-2 z-30 rounded-full border border-amber-300 bg-amber-100 p-1 shadow-lg">
            <ArrowsRightLeftIcon className="h-3 w-3 text-amber-600" />
          </div>
        )}
        <button
          onClick={handleRemove}
          className="absolute top-0.5 right-0.5 z-20 rounded-full bg-red-100 p-0.5 text-red-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-200 hover:opacity-100 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-800/50"
          title="Remove from schedule"
          type="button"
        >
          <TrashIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
