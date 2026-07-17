'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { generateTimeSlots } from '@/lib/schedule/types'
import { SCHEDULE_START, SCHEDULE_END } from '@/lib/schedule/time'
import { PIXELS_PER_MINUTE, SLOT_INTERVAL } from '@/lib/schedule/geometry'
import { TrackHeader } from './track/TrackHeader'
import { TimeSlotDropZone } from './track/TimeSlotDropZone'
import { ServiceSession } from './track/ServiceSession'
import { ScheduledTalk } from './track/ScheduledTalk'
import { ServiceSessionModal } from './track/ServiceSessionModal'

interface DroppableTrackProps {
  track: ScheduleTrack
  trackIndex: number
  onUpdateTrack: (track: ScheduleTrack) => void
  onRemoveTrack: () => void
  onRemoveTalk: (talkIndex: number) => void
  onDuplicateServiceSession?: (
    serviceSession: TrackTalk,
    sourceTrackIndex: number,
  ) => void
  // Service-session mutations are dispatched to the reducer by the parent, so
  // this component no longer recomputes tracks itself — it reports the intent.
  onAddServiceSession?: (
    startTime: string,
    title: string,
    duration: number,
  ) => void
  onResizeServiceSession?: (talkIndex: number, duration: number) => void
  onRenameServiceSession?: (talkIndex: number, title: string) => void
}

const TRACK_CONSTRAINTS = {
  MIN_WIDTH: 320,
  MAX_WIDTH: 384,
} as const

function DroppableTrack({
  track,
  trackIndex,
  onUpdateTrack,
  onRemoveTrack,
  onRemoveTalk,
  onDuplicateServiceSession,
  onAddServiceSession,
  onResizeServiceSession,
  onRenameServiceSession,
}: DroppableTrackProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(track.trackTitle)
  const [editDescription, setEditDescription] = useState(track.trackDescription)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [hoveredSwapTimeSlot, setHoveredSwapTimeSlot] = useState<string | null>(
    null,
  )

  const timeSlots = useMemo(
    () => generateTimeSlots(SCHEDULE_START, SCHEDULE_END, SLOT_INTERVAL),
    [],
  )

  const trackHeight = useMemo(
    () => timeSlots.length * (SLOT_INTERVAL * PIXELS_PER_MINUTE),
    [timeSlots.length],
  )

  const { setNodeRef, isOver } = useDroppable({
    id: `track-${trackIndex}`,
    data: {
      type: 'track',
      trackIndex,
    },
  })

  const handleSaveEdit = useCallback(() => {
    const trimmedTitle = editTitle.trim()
    // Reject an empty/whitespace-only title (mirrors the service-session rename
    // and AddTrackModal): keep the previous title and exit edit mode.
    if (!trimmedTitle) {
      setEditTitle(track.trackTitle)
      setIsEditing(false)
      return
    }
    onUpdateTrack({
      ...track,
      trackTitle: trimmedTitle,
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

  const handleCreateServiceSession = useCallback((timeSlot: string) => {
    setSelectedTimeSlot(timeSlot)
    setShowServiceModal(true)
  }, [])

  const handleSaveServiceSession = useCallback(
    (title: string, duration: number) => {
      onAddServiceSession?.(selectedTimeSlot, title, duration)
      setShowServiceModal(false)
      setSelectedTimeSlot('')
    },
    [selectedTimeSlot, onAddServiceSession],
  )

  const handleCloseServiceModal = useCallback(() => {
    setShowServiceModal(false)
    setSelectedTimeSlot('')
  }, [])

  const handleUpdateServiceSession = useCallback(
    (index: number, newDuration: number) => {
      if (track.talks[index]?.placeholder) {
        onResizeServiceSession?.(index, newDuration)
      }
    },
    [track.talks, onResizeServiceSession],
  )

  const handleRenameServiceSession = useCallback(
    (index: number, newTitle: string) => {
      if (track.talks[index]?.placeholder) {
        onRenameServiceSession?.(index, newTitle)
      }
    },
    [track.talks, onRenameServiceSession],
  )

  const handleDuplicateServiceSession = useCallback(
    (serviceSession: TrackTalk) => {
      if (onDuplicateServiceSession) {
        onDuplicateServiceSession(serviceSession, trackIndex)
      }
    },
    [onDuplicateServiceSession, trackIndex],
  )

  const trackContainerClasses = useMemo(() => {
    const baseClasses =
      'relative rounded-b-lg border-r border-b border-l border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'
    return isOver
      ? `${baseClasses} bg-blue-50 dark:bg-blue-900/20`
      : baseClasses
  }, [isOver])

  return (
    <div
      className="shrink-0"
      style={{
        width: `${TRACK_CONSTRAINTS.MIN_WIDTH}px`,
        minWidth: `${TRACK_CONSTRAINTS.MIN_WIDTH}px`,
        maxWidth: `${TRACK_CONSTRAINTS.MAX_WIDTH}px`,
      }}
    >
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

      <div
        ref={setNodeRef}
        className={trackContainerClasses}
        style={{ height: `${trackHeight}px` }}
      >
        {timeSlots.map((timeSlot) => (
          <TimeSlotDropZone
            key={timeSlot.time}
            timeSlot={timeSlot}
            trackIndex={trackIndex}
            track={track}
            onCreateServiceSession={handleCreateServiceSession}
            onSwapHover={setHoveredSwapTimeSlot}
          />
        ))}

        {track.talks.map((talk, talkIndex) => {
          // TODO(phase6: discriminated-union slots) — a `TrackTalk` is either a
          // real talk (`.talk`) or a service session (`.placeholder`); this
          // hand-discrimination is the densest spot for the Phase 6 union type.
          if (talk.placeholder) {
            return (
              <ServiceSession
                key={`service-${talk.startTime}-${talkIndex}`}
                talk={talk}
                talkIndex={talkIndex}
                trackIndex={trackIndex}
                track={track}
                onRemoveTalk={onRemoveTalk}
                onUpdateSession={handleUpdateServiceSession}
                onRenameSession={handleRenameServiceSession}
                onDuplicate={handleDuplicateServiceSession}
              />
            )
          } else {
            return (
              <ScheduledTalk
                key={`${talk.talk?._id}-${talk.startTime}-${talkIndex}`}
                talk={talk}
                talkIndex={talkIndex}
                trackIndex={trackIndex}
                hoveredSwapTimeSlot={hoveredSwapTimeSlot}
              />
            )
          }
        })}

        {track.talks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Drop talks here or create service sessions
            </p>
          </div>
        )}
      </div>

      <ServiceSessionModal
        isOpen={showServiceModal}
        timeSlot={selectedTimeSlot}
        onClose={handleCloseServiceModal}
        onSave={handleSaveServiceSession}
      />
    </div>
  )
}

export const MemoizedDroppableTrack = React.memo(DroppableTrack)
MemoizedDroppableTrack.displayName = 'MemoizedDroppableTrack'
