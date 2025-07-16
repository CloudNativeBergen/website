'use client'

import { useDroppable } from '@dnd-kit/core'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import {
  DragItem,
  generateTimeSlots,
  TimeSlot,
  findAvailableTimeSlot,
} from '@/lib/schedule/types'
import { DraggableProposal } from './DraggableProposal'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useState, useMemo, useCallback } from 'react'

interface DroppableTrackProps {
  track: ScheduleTrack
  trackIndex: number
  onUpdateTrack: (track: ScheduleTrack) => void
  onRemoveTrack: () => void
  onRemoveTalk: (talkIndex: number) => void
  activeDragItem?: DragItem | null
}

interface TimeSlotDropZoneProps {
  timeSlot: TimeSlot
  trackIndex: number
  track: ScheduleTrack
  activeDragItem?: DragItem | null
}

// Constants for better maintainability
const SCHEDULE_CONFIG = {
  START_TIME: '09:00',
  END_TIME: '17:00',
  SLOT_INTERVAL: 5,
  PIXELS_PER_MINUTE: 2.4,
  LABEL_INTERVAL: 15, // Show time labels every 15 minutes
} as const

const TRACK_CONSTRAINTS = {
  MIN_WIDTH: 320, // min-w-80 = 320px
  MAX_WIDTH: 384, // max-w-96 = 384px
} as const

// Memoized time calculation functions
const calculateTimePosition = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)
  const startHour = 9 // 09:00
  const totalMinutes = (hours - startHour) * 60 + minutes
  return Math.max(0, totalMinutes * SCHEDULE_CONFIG.PIXELS_PER_MINUTE)
}

const calculateTalkPosition = (
  talk: TrackTalk,
): { top: number; height: number } => {
  const top = calculateTimePosition(talk.startTime)
  const startTime = new Date(`2000-01-01T${talk.startTime}:00`)
  const endTime = new Date(`2000-01-01T${talk.endTime}:00`)
  const durationMinutes =
    (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  const height = durationMinutes * SCHEDULE_CONFIG.PIXELS_PER_MINUTE

  return { top, height }
}

const shouldShowTimeLabel = (time: string): boolean => {
  const [, minutes] = time.split(':').map(Number)
  return minutes % SCHEDULE_CONFIG.LABEL_INTERVAL === 0
}

// Memoized TimeSlotDropZone component
const TimeSlotDropZone = ({
  timeSlot,
  trackIndex,
  track,
  activeDragItem,
}: TimeSlotDropZoneProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `track-${trackIndex}-time-${timeSlot.time}`,
    data: {
      type: 'time-slot',
      trackIndex,
      timeSlot: timeSlot.time,
    },
  })

  // Memoize canDrop calculation
  const canDrop = useMemo(() => {
    if (!activeDragItem) return true

    // If moving a scheduled talk within the same track, exclude it from conflict detection
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
  }, [activeDragItem, track, timeSlot.time, trackIndex])

  // Memoize position and class calculations
  const position = useMemo(
    () => calculateTimePosition(timeSlot.time),
    [timeSlot.time],
  )
  const showLabel = useMemo(
    () => shouldShowTimeLabel(timeSlot.time),
    [timeSlot.time],
  )

  const dropZoneClasses = useMemo(() => {
    const baseClasses = 'absolute right-0 left-0 h-3 border-b border-gray-100'
    if (isOver && canDrop) return `${baseClasses} border-blue-300 bg-blue-100`
    if (isOver && !canDrop) return `${baseClasses} border-red-300 bg-red-100`
    return baseClasses
  }, [isOver, canDrop])

  return (
    <div
      ref={setNodeRef}
      className={dropZoneClasses}
      style={{ top: `${position}px` }}
    >
      {showLabel && (
        <div className="absolute -top-0.5 left-2 text-xs text-gray-400">
          {timeSlot.displayTime}
        </div>
      )}
    </div>
  )
}

// Memoized ScheduledTalk component
const ScheduledTalk = ({
  talk,
  talkIndex,
  trackIndex,
  onRemoveTalk,
}: {
  talk: TrackTalk
  talkIndex: number
  trackIndex: number
  onRemoveTalk: (index: number) => void
}) => {
  const position = useMemo(() => calculateTalkPosition(talk), [talk])

  const handleRemove = useCallback(() => {
    onRemoveTalk(talkIndex)
  }, [onRemoveTalk, talkIndex])

  if (!talk.talk) return null

  return (
    <div
      key={`${talk.talk._id}-${talk.startTime}`}
      className="group absolute right-2 left-2 z-10"
      style={{
        top: `${position.top}px`,
        height: `${position.height}px`,
      }}
    >
      <div className="relative h-full">
        <DraggableProposal
          proposal={talk.talk}
          sourceTrackIndex={trackIndex}
          sourceTimeSlot={talk.startTime}
        />
        <button
          onClick={handleRemove}
          className="absolute top-0.5 right-0.5 z-20 rounded-full bg-red-100 p-0.5 text-red-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-200 hover:opacity-100"
          title="Remove from schedule"
          type="button"
        >
          <TrashIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// Memoized TrackHeader component
const TrackHeader = ({
  track,
  isEditing,
  editTitle,
  editDescription,
  onEditTitle,
  onEditDescription,
  onSave,
  onCancel,
  onStartEdit,
  onRemoveTrack,
}: {
  track: ScheduleTrack
  isEditing: boolean
  editTitle: string
  editDescription: string
  onEditTitle: (value: string) => void
  onEditDescription: (value: string) => void
  onSave: () => void
  onCancel: () => void
  onStartEdit: () => void
  onRemoveTrack: () => void
}) => {
  return (
    <div className="rounded-t-lg border border-gray-200 bg-white p-4 shadow-sm">
      {isEditing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onEditTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Track title"
            autoFocus
          />
          <textarea
            value={editDescription}
            onChange={(e) => onEditDescription(e.target.value)}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            rows={2}
            placeholder="Track description"
          />
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              type="button"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="rounded-md bg-gray-300 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-500 focus:outline-none"
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-gray-900">
              {track.trackTitle}
            </h3>
            {track.trackDescription && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                {track.trackDescription}
              </p>
            )}
          </div>
          <div className="ml-3 flex flex-shrink-0 gap-1">
            <button
              onClick={onStartEdit}
              className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              title="Edit track"
              type="button"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              onClick={onRemoveTrack}
              className="rounded p-1 text-gray-400 transition-colors hover:text-red-600 focus:ring-2 focus:ring-red-500 focus:outline-none"
              title="Remove track"
              type="button"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function DroppableTrack({
  track,
  trackIndex,
  onUpdateTrack,
  onRemoveTrack,
  onRemoveTalk,
  activeDragItem,
}: DroppableTrackProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(track.trackTitle)
  const [editDescription, setEditDescription] = useState(track.trackDescription)

  // Memoize expensive calculations
  const timeSlots = useMemo(
    () =>
      generateTimeSlots(
        SCHEDULE_CONFIG.START_TIME,
        SCHEDULE_CONFIG.END_TIME,
        SCHEDULE_CONFIG.SLOT_INTERVAL,
      ),
    [],
  )

  const trackHeight = useMemo(
    () =>
      timeSlots.length *
      (SCHEDULE_CONFIG.SLOT_INTERVAL * SCHEDULE_CONFIG.PIXELS_PER_MINUTE),
    [timeSlots.length],
  )

  const { setNodeRef, isOver } = useDroppable({
    id: `track-${trackIndex}`,
    data: {
      type: 'track',
      trackIndex,
    },
  })

  // Memoized event handlers
  const handleSaveEdit = useCallback(() => {
    onUpdateTrack({
      ...track,
      trackTitle: editTitle,
      trackDescription: editDescription,
    })
    setIsEditing(false)
  }, [onUpdateTrack, track, editTitle, editDescription])

  const handleCancelEdit = useCallback(() => {
    setEditTitle(track.trackTitle)
    setEditDescription(track.trackDescription)
    setIsEditing(false)
  }, [track.trackTitle, track.trackDescription])

  const handleStartEdit = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleEditTitle = useCallback((value: string) => {
    setEditTitle(value)
  }, [])

  const handleEditDescription = useCallback((value: string) => {
    setEditDescription(value)
  }, [])

  // Memoize track container classes
  const trackContainerClasses = useMemo(() => {
    const baseClasses =
      'relative rounded-b-lg border-r border-b border-l border-gray-200 bg-gray-50'
    return isOver ? `${baseClasses} bg-blue-50` : baseClasses
  }, [isOver])

  return (
    <div
      className="flex-1"
      style={{
        minWidth: `${TRACK_CONSTRAINTS.MIN_WIDTH}px`,
        maxWidth: `${TRACK_CONSTRAINTS.MAX_WIDTH}px`,
      }}
    >
      {/* Track Header */}
      <TrackHeader
        track={track}
        isEditing={isEditing}
        editTitle={editTitle}
        editDescription={editDescription}
        onEditTitle={handleEditTitle}
        onEditDescription={handleEditDescription}
        onSave={handleSaveEdit}
        onCancel={handleCancelEdit}
        onStartEdit={handleStartEdit}
        onRemoveTrack={onRemoveTrack}
      />

      {/* Track Timeline */}
      <div
        ref={setNodeRef}
        className={trackContainerClasses}
        style={{ height: `${trackHeight}px` }}
      >
        {/* Time slots grid */}
        {timeSlots.map((timeSlot) => (
          <TimeSlotDropZone
            key={timeSlot.time}
            timeSlot={timeSlot}
            trackIndex={trackIndex}
            track={track}
            activeDragItem={activeDragItem}
          />
        ))}

        {/* Scheduled talks */}
        {track.talks.map((talk, talkIndex) => (
          <ScheduledTalk
            key={`${talk.talk?._id}-${talk.startTime}-${talkIndex}`}
            talk={talk}
            talkIndex={talkIndex}
            trackIndex={trackIndex}
            onRemoveTalk={onRemoveTalk}
          />
        ))}

        {/* Empty state */}
        {track.talks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-400">Drop talks here</p>
          </div>
        )}
      </div>
    </div>
  )
}
