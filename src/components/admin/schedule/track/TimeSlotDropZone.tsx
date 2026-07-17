'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ScheduleTrack } from '@/lib/conference/types'
import { TimeSlot } from '@/lib/schedule/types'
import { addMinutes } from '@/lib/schedule/time'
import {
  findAvailableTimeSlot,
  canSwapTalks,
  canPlaceDisplacedBack,
  isTrackIntervalFree,
  matchTalk,
} from '@/lib/schedule/rules'
import {
  calculateTimePosition,
  shouldShowTimeLabel,
  SLOT_INTERVAL,
} from '@/lib/schedule/geometry'
import { PlusIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline'
import { useScheduleContext } from '../ScheduleContext'

interface TimeSlotDropZoneProps {
  timeSlot: TimeSlot
  trackIndex: number
  track: ScheduleTrack
  onCreateServiceSession: (timeSlot: string) => void
  onSwapHover?: (timeSlot: string | null) => void
}

export const TimeSlotDropZone = ({
  timeSlot,
  trackIndex,
  track,
  onCreateServiceSession,
  onSwapHover,
}: TimeSlotDropZoneProps) => {
  // `activeDragItem` and the whole-day `schedule` come from context instead of
  // being prop-drilled through TracksGrid → DroppableTrack. The schedule lets
  // `canDrop` validate the REVERSE half of a swap (see below).
  const { activeDragItem, schedule } = useScheduleContext()

  const { setNodeRef, isOver } = useDroppable({
    id: `track-${trackIndex}-time-${timeSlot.time}`,
    data: {
      type: 'time-slot',
      trackIndex,
      timeSlot: timeSlot.time,
    },
  })

  useEffect(() => {
    if (!onSwapHover) return

    const occupiedTalk = track.talks.find(
      (talk) => talk.startTime === timeSlot.time,
    )
    const isSwapOperation =
      occupiedTalk &&
      occupiedTalk.talk &&
      activeDragItem?.type === 'scheduled-talk' &&
      activeDragItem.proposal &&
      isOver

    const isSelfSwap =
      isSwapOperation &&
      activeDragItem?.proposal?._id === occupiedTalk?.talk?._id &&
      activeDragItem?.sourceTimeSlot === timeSlot.time

    if (isSwapOperation && !isSelfSwap) {
      onSwapHover(timeSlot.time)
      // Clear when this slot stops being the swap target — including when the
      // pointer leaves the track entirely (isOver → false). Without this
      // cleanup the amber "SWAP" ring stayed stuck on the talk because the old
      // code only cleared inside the `else if (isOver)` branch, which never runs
      // once the slot is no longer hovered.
      return () => onSwapHover(null)
    }
  }, [isOver, timeSlot.time, track.talks, activeDragItem, onSwapHover])

  const canDrop = useMemo(() => {
    if (!activeDragItem) return true

    if (!activeDragItem.proposal) return true

    const occupiedTalk = track.talks.find(
      (talk) => talk.startTime === timeSlot.time,
    )

    if (occupiedTalk && occupiedTalk.talk) {
      if (
        activeDragItem.type === 'scheduled-talk' &&
        activeDragItem.sourceTrackIndex !== undefined &&
        activeDragItem.sourceTimeSlot !== undefined
      ) {
        if (
          activeDragItem.proposal._id === occupiedTalk.talk._id &&
          activeDragItem.sourceTimeSlot === timeSlot.time
        ) {
          return false
        }

        // Validate BOTH directions of the swap so the indicator matches what the
        // reducer's `moveProposal` will actually do: the dragged talk must fit
        // the target slot AND the displaced talk must fit back into the source
        // track. Checking only the forward `canSwapTalks` let the UI show a swap
        // as droppable that the drop then rejected.
        const sourceTrack = schedule?.tracks[activeDragItem.sourceTrackIndex]
        const draggedExclude = matchTalk(
          activeDragItem.proposal._id,
          activeDragItem.sourceTimeSlot,
        )
        return (
          canSwapTalks(
            track,
            activeDragItem.proposal,
            occupiedTalk,
            timeSlot.time,
          ) &&
          !!sourceTrack &&
          canPlaceDisplacedBack(
            sourceTrack,
            occupiedTalk,
            activeDragItem.sourceTimeSlot,
            draggedExclude,
          )
        )
      }

      return false
    }

    const excludeTalk =
      activeDragItem.type === 'scheduled-talk' &&
      activeDragItem.sourceTrackIndex === trackIndex
        ? {
            talkId: activeDragItem.proposal._id,
            startTime: activeDragItem.sourceTimeSlot!,
          }
        : undefined

    return (
      findAvailableTimeSlot(
        track,
        activeDragItem.proposal,
        timeSlot.time,
        excludeTalk,
      ) === timeSlot.time
    )
  }, [activeDragItem, track, timeSlot.time, trackIndex, schedule])

  // Gate on the WHOLE slot interval, not just an exact start-time match, so the
  // "＋ Service" button never appears on a 5-min slot that falls INSIDE an
  // existing talk/session (an exact-start check let it show mid-talk).
  const isOccupied = useMemo(() => {
    const slotEnd = addMinutes(timeSlot.time, SLOT_INTERVAL)
    return !isTrackIntervalFree(track, timeSlot.time, slotEnd)
  }, [track, timeSlot.time])

  const position = useMemo(
    () => calculateTimePosition(timeSlot.time),
    [timeSlot.time],
  )
  const showLabel = useMemo(
    () => shouldShowTimeLabel(timeSlot.time),
    [timeSlot.time],
  )

  const dropZoneClasses = useMemo(() => {
    const baseClasses =
      'absolute right-0 left-0 h-3 border-b border-gray-100 dark:border-gray-700'

    if (isOver && canDrop) {
      return `${baseClasses} border-blue-300 bg-blue-100 dark:border-blue-600 dark:bg-blue-900/30`
    }

    if (isOver && !canDrop)
      return `${baseClasses} border-red-300 bg-red-100 dark:border-red-600 dark:bg-red-900/30`
    return baseClasses
  }, [isOver, canDrop])

  const handleAddServiceSession = useCallback(() => {
    onCreateServiceSession(timeSlot.time)
  }, [onCreateServiceSession, timeSlot.time])

  return (
    <div
      ref={setNodeRef}
      className={`${dropZoneClasses} group`}
      style={{ top: `${position}px` }}
    >
      {showLabel && (
        <div className="absolute -top-0.5 left-2 text-xs text-gray-400 dark:text-gray-500">
          {timeSlot.displayTime}
        </div>
      )}

      {isOccupied &&
        activeDragItem?.type === 'scheduled-talk' &&
        isOver &&
        canDrop && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex animate-bounce items-center gap-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white shadow-xl dark:bg-orange-700">
              <ArrowsRightLeftIcon className="h-4 w-4 animate-pulse" />
              <span className="font-semibold">SWAP</span>
              <ArrowsRightLeftIcon className="h-4 w-4 animate-pulse" />
            </div>
          </div>
        )}

      {!isOccupied && !activeDragItem && (
        <button
          onClick={handleAddServiceSession}
          className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-all duration-200 group-hover:opacity-100 hover:z-20"
          title="Create service session"
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-none flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white shadow-lg dark:bg-blue-700">
            <PlusIcon className="h-3 w-3" />
            Service
          </div>
        </button>
      )}
    </div>
  )
}
