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
import { useState } from 'react'

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

function TimeSlotDropZone({
  timeSlot,
  trackIndex,
  track,
  activeDragItem,
}: TimeSlotDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `track-${trackIndex}-time-${timeSlot.time}`,
    data: {
      type: 'time-slot',
      trackIndex,
      timeSlot: timeSlot.time,
    },
  })

  // Check if the current drag item can be dropped at this time slot
  const canDrop = activeDragItem
    ? (() => {
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
      })()
    : true

  // Helper function to determine if we should show the time label (every 15 minutes)
  const shouldShowTimeLabel = (time: string): boolean => {
    const [hours, minutes] = time.split(':').map(Number)
    return minutes % 15 === 0
  }

  return (
    <div
      ref={setNodeRef}
      className={`absolute right-0 left-0 h-3 border-b border-gray-100 ${isOver && canDrop ? 'border-blue-300 bg-blue-100' : ''} ${isOver && !canDrop ? 'border-red-300 bg-red-100' : ''} `}
      style={{
        top: `${calculateTimePosition(timeSlot.time)}px`,
      }}
    >
      {shouldShowTimeLabel(timeSlot.time) && (
        <div className="absolute -top-0.5 left-2 text-xs text-gray-400">
          {timeSlot.displayTime}
        </div>
      )}
    </div>
  )
}

function calculateTimePosition(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  const startHour = 9 // 09:00
  const totalMinutes = (hours - startHour) * 60 + minutes
  return Math.max(0, totalMinutes * 2.4) // 2.4px per minute (12px per 5-minute slot)
}

function calculateTalkPosition(talk: TrackTalk): {
  top: number
  height: number
} {
  const top = calculateTimePosition(talk.startTime)
  const startTime = new Date(`2000-01-01T${talk.startTime}:00`)
  const endTime = new Date(`2000-01-01T${talk.endTime}:00`)
  const durationMinutes =
    (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  const height = durationMinutes * 2.4 // Exact height based on duration

  return { top, height }
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

  const timeSlots = generateTimeSlots('09:00', '17:00', 5)
  const trackHeight = timeSlots.length * 12 // 12px per 5-minute slot

  const { setNodeRef, isOver } = useDroppable({
    id: `track-${trackIndex}`,
    data: {
      type: 'track',
      trackIndex,
    },
  })

  const handleSaveEdit = () => {
    onUpdateTrack({
      ...track,
      trackTitle: editTitle,
      trackDescription: editDescription,
    })
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditTitle(track.trackTitle)
    setEditDescription(track.trackDescription)
    setIsEditing(false)
  }

  return (
    <div className="max-w-96 min-w-80 flex-1">
      {/* Track Header */}
      <div className="rounded-t-lg border border-gray-200 bg-white p-4 shadow-sm">
        {isEditing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Track title"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={2}
              placeholder="Track description"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="rounded-md bg-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  {track.trackTitle}
                </h3>
                {track.trackDescription && (
                  <p className="mt-1 text-sm text-gray-600">
                    {track.trackDescription}
                  </p>
                )}
              </div>
              <div className="ml-3 flex gap-1">
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title="Edit track"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={onRemoveTrack}
                  className="p-1 text-gray-400 hover:text-red-600"
                  title="Remove track"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Track Timeline */}
      <div
        ref={setNodeRef}
        className={`relative rounded-b-lg border-r border-b border-l border-gray-200 bg-gray-50 ${isOver ? 'bg-blue-50' : ''} `}
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
        {track.talks.map((talk, talkIndex) => {
          if (!talk.talk) return null

          const position = calculateTalkPosition(talk)

          return (
            <div
              key={`${talk.talk._id}-${talk.startTime}`}
              className="absolute right-2 left-2 z-10"
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
                  onClick={() => onRemoveTalk(talkIndex)}
                  className="absolute top-1 right-1 rounded-full bg-red-100 p-1 text-red-600 opacity-0 transition-opacity hover:opacity-100"
                  title="Remove from schedule"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}

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
