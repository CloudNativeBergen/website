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
import { DraggableServiceSession } from './DraggableServiceSession'
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import { useState, useMemo, useCallback, useEffect } from 'react'
import React from 'react'

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
  activeDragItem?: DragItem | null
}

interface TimeSlotDropZoneProps {
  timeSlot: TimeSlot
  trackIndex: number
  track: ScheduleTrack
  activeDragItem?: DragItem | null
  onCreateServiceSession: (timeSlot: string) => void
}

interface ServiceSessionModalProps {
  isOpen: boolean
  timeSlot: string
  onClose: () => void
  onSave: (title: string, duration: number) => void
}

// Constants for better maintainability
const SCHEDULE_CONFIG = {
  START_TIME: '08:00',
  END_TIME: '21:00',
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
  const startHour = 8 // 08:00
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

// Helper function to add minutes to a time string
const addMinutesToTime = (time: string, minutes: number): string => {
  const [hours, mins] = time.split(':').map(Number)
  const date = new Date(2000, 0, 1, hours, mins)
  date.setMinutes(date.getMinutes() + minutes)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

// Service Session Modal Component
const ServiceSessionModal = ({
  isOpen,
  timeSlot,
  onClose,
  onSave,
}: ServiceSessionModalProps) => {
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(10) // Default 10 minutes

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (title.trim()) {
        onSave(title.trim(), duration)
        setTitle('')
        setDuration(10)
      }
    },
    [title, duration, onSave],
  )

  const handleClose = useCallback(() => {
    setTitle('')
    setDuration(10)
    onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Create Service Session
        </h3>
        <p className="mb-4 text-sm text-gray-600">Starting at {timeSlot}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Session Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g., Coffee Break, Lunch, Networking"
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="duration"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Duration (minutes)
            </label>
            <select
              id="duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={20}>20 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              Create Session
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-500 focus:outline-none"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Service Session Component with resize handle and drag functionality
const ServiceSession = ({
  talk,
  talkIndex,
  trackIndex,
  onRemoveTalk,
  onUpdateSession,
  onRenameSession,
  onDuplicate,
}: {
  talk: TrackTalk
  talkIndex: number
  trackIndex: number
  onRemoveTalk: (index: number) => void
  onUpdateSession: (index: number, newDuration: number) => void
  onRenameSession: (index: number, newTitle: string) => void
  onDuplicate: (talk: TrackTalk) => void
}) => {
  const [isResizing, setIsResizing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(talk.placeholder || '')
  const [startY, setStartY] = useState(0)
  const [startHeight, setStartHeight] = useState(0)

  const position = useMemo(() => calculateTalkPosition(talk), [talk])

  const handleRemove = useCallback(() => {
    onRemoveTalk(talkIndex)
  }, [onRemoveTalk, talkIndex])

  const handleDuplicate = useCallback(() => {
    onDuplicate(talk)
  }, [onDuplicate, talk])

  const handleStartEdit = useCallback(() => {
    setIsEditing(true)
    setEditTitle(talk.placeholder || '')
  }, [talk.placeholder])

  const handleSaveEdit = useCallback(() => {
    if (editTitle.trim()) {
      onRenameSession(talkIndex, editTitle.trim())
      setIsEditing(false)
    }
  }, [editTitle, onRenameSession, talkIndex])

  const handleCancelEdit = useCallback(() => {
    setEditTitle(talk.placeholder || '')
    setIsEditing(false)
  }, [talk.placeholder])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSaveEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancelEdit()
      }
    },
    [handleSaveEdit, handleCancelEdit],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation() // Prevent event bubbling
      setIsResizing(true)
      setStartY(e.clientY)
      setStartHeight(position.height)
    },
    [position.height],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return

      e.preventDefault() // Prevent text selection during drag

      const deltaY = e.clientY - startY
      const newHeight = Math.max(12, startHeight + deltaY) // Minimum 5 minutes (12px)
      const newDuration =
        Math.round(newHeight / SCHEDULE_CONFIG.PIXELS_PER_MINUTE / 5) * 5 // Round to 5-minute intervals

      if (newDuration >= 5 && newDuration <= 180) {
        // Max 3 hours
        onUpdateSession(talkIndex, newDuration)
      }
    },
    [isResizing, startY, startHeight, talkIndex, onUpdateSession],
  )

  const handleMouseUp = useCallback((e: MouseEvent) => {
    e.preventDefault()
    setIsResizing(false)
  }, [])

  // Add global mouse listeners for resizing:
  // These listeners are necessary to track mouse movements and actions outside the component
  // during resizing, ensuring the resizing logic works even if the cursor leaves the component's bounds.
  // Potential side effects include interference with other global listeners and performance overhead.
  // Cleanup is handled in the useEffect cleanup function to prevent memory leaks or unintended behavior.
  useEffect(() => {
    if (isResizing) {
      const handleMouseMoveGlobal = (e: MouseEvent) => handleMouseMove(e)
      const handleMouseUpGlobal = (e: MouseEvent) => handleMouseUp(e)
      const handleMouseLeave = () => setIsResizing(false) // Stop resizing if mouse leaves window

      document.addEventListener('mousemove', handleMouseMoveGlobal)
      document.addEventListener('mouseup', handleMouseUpGlobal)
      document.addEventListener('mouseleave', handleMouseLeave)

      // Also listen for escape key to cancel resize
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsResizing(false)
        }
      }
      document.addEventListener('keydown', handleKeyDown)

      return () => {
        document.removeEventListener('mousemove', handleMouseMoveGlobal)
        document.removeEventListener('mouseup', handleMouseUpGlobal)
        document.removeEventListener('mouseleave', handleMouseLeave)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  if (!talk.placeholder) return null

  return (
    <div
      className="group absolute right-2 left-2 z-10"
      style={{
        top: `${position.top}px`,
        height: `${position.height}px`,
      }}
    >
      <div className="relative h-full">
        {/* Use DraggableServiceSession for the main content */}
        <DraggableServiceSession
          serviceSession={talk}
          sourceTrackIndex={trackIndex}
          sourceTimeSlot={talk.startTime}
        />

        {/* Editing overlay */}
        {isEditing && (
          <div className="absolute inset-0 z-30 rounded-md border-2 border-blue-400 bg-blue-50 p-2">
            <div className="space-y-1">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveEdit}
                className="w-full rounded border border-blue-300 bg-white px-1 py-0.5 text-xs font-medium text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleSaveEdit}
                  className="rounded px-1 py-0.5 text-xs text-blue-600 hover:bg-blue-100"
                  type="button"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="rounded px-1 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Resize handle */}
        <div
          className={`absolute right-0 bottom-0 left-0 z-20 h-2 cursor-ns-resize border-t transition-all ${
            isResizing
              ? 'border-blue-400 bg-blue-200 opacity-100'
              : 'border-gray-400 bg-gray-200 opacity-0 group-hover:opacity-100'
          }`}
          onMouseDown={handleMouseDown}
          title="Drag to resize"
        >
          <div
            className={`absolute inset-x-0 top-0.5 mx-auto h-0.5 w-6 rounded ${
              isResizing ? 'bg-blue-500' : 'bg-gray-400'
            }`}
          ></div>
        </div>

        {/* Action buttons */}
        <div className="absolute top-0.5 right-0.5 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={handleStartEdit}
            className="rounded-full bg-gray-100 p-0.5 text-gray-600 transition-colors hover:bg-gray-200 hover:opacity-100"
            title="Rename session"
            type="button"
          >
            <PencilIcon className="h-3 w-3" />
          </button>
          <button
            onClick={handleDuplicate}
            className="rounded-full bg-blue-100 p-0.5 text-blue-600 transition-colors hover:bg-blue-200 hover:opacity-100"
            title="Duplicate to all tracks"
            type="button"
          >
            <DocumentDuplicateIcon className="h-3 w-3" />
          </button>
          <button
            onClick={handleRemove}
            className="rounded-full bg-red-100 p-0.5 text-red-600 transition-colors hover:bg-red-200 hover:opacity-100"
            title="Remove session"
            type="button"
          >
            <TrashIcon className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Memoized TimeSlotDropZone component
const TimeSlotDropZone = ({
  timeSlot,
  trackIndex,
  track,
  activeDragItem,
  onCreateServiceSession,
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

    // Only check conflicts for proposals (talks), not service sessions
    if (!activeDragItem.proposal) return true

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

  // Check if this time slot is occupied
  const isOccupied = useMemo(() => {
    return track.talks.some((talk) => talk.startTime === timeSlot.time)
  }, [track.talks, timeSlot.time])

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
        <div className="absolute -top-0.5 left-2 text-xs text-gray-400">
          {timeSlot.displayTime}
        </div>
      )}

      {/* Add service session button - only show when not occupied and not dragging */}
      {!isOccupied && !activeDragItem && (
        <button
          onClick={handleAddServiceSession}
          className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-all duration-200 group-hover:opacity-100 hover:z-20"
          title="Create service session"
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-none flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white shadow-lg">
            <PlusIcon className="h-3 w-3" />
            Service
          </div>
        </button>
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

function DroppableTrack({
  track,
  trackIndex,
  onUpdateTrack,
  onRemoveTrack,
  onRemoveTalk,
  onDuplicateServiceSession,
  activeDragItem,
}: DroppableTrackProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(track.trackTitle)
  const [editDescription, setEditDescription] = useState(track.trackDescription)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')

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

  const handleCreateServiceSession = useCallback((timeSlot: string) => {
    setSelectedTimeSlot(timeSlot)
    setShowServiceModal(true)
  }, [])

  const handleSaveServiceSession = useCallback(
    (title: string, duration: number) => {
      const startTime = selectedTimeSlot
      const endTime = addMinutesToTime(startTime, duration)

      const newServiceSession: TrackTalk = {
        placeholder: title,
        startTime,
        endTime,
      }

      const updatedTrack = {
        ...track,
        talks: [...track.talks, newServiceSession].sort((a, b) => {
          return a.startTime.localeCompare(b.startTime)
        }),
      }

      onUpdateTrack(updatedTrack)
      setShowServiceModal(false)
      setSelectedTimeSlot('')
    },
    [selectedTimeSlot, track, onUpdateTrack],
  )

  const handleCloseServiceModal = useCallback(() => {
    setShowServiceModal(false)
    setSelectedTimeSlot('')
  }, [])

  const handleUpdateServiceSession = useCallback(
    (index: number, newDuration: number) => {
      const updatedTalks = [...track.talks]
      const talk = updatedTalks[index]

      if (talk.placeholder) {
        updatedTalks[index] = {
          ...talk,
          endTime: addMinutesToTime(talk.startTime, newDuration),
        }

        onUpdateTrack({
          ...track,
          talks: updatedTalks,
        })
      }
    },
    [track, onUpdateTrack],
  )

  const handleRenameServiceSession = useCallback(
    (index: number, newTitle: string) => {
      const updatedTalks = [...track.talks]
      const talk = updatedTalks[index]

      if (talk.placeholder) {
        updatedTalks[index] = {
          ...talk,
          placeholder: newTitle,
        }

        onUpdateTrack({
          ...track,
          talks: updatedTalks,
        })
      }
    },
    [track, onUpdateTrack],
  )

  const handleDuplicateServiceSession = useCallback(
    (serviceSession: TrackTalk) => {
      if (onDuplicateServiceSession) {
        onDuplicateServiceSession(serviceSession, trackIndex)
      }
    },
    [onDuplicateServiceSession, trackIndex],
  )

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
            onCreateServiceSession={handleCreateServiceSession}
          />
        ))}

        {/* Scheduled talks and service sessions */}
        {track.talks.map((talk, talkIndex) => {
          if (talk.placeholder) {
            // Render service session
            return (
              <ServiceSession
                key={`service-${talk.startTime}-${talkIndex}`}
                talk={talk}
                talkIndex={talkIndex}
                trackIndex={trackIndex}
                onRemoveTalk={onRemoveTalk}
                onUpdateSession={handleUpdateServiceSession}
                onRenameSession={handleRenameServiceSession}
                onDuplicate={handleDuplicateServiceSession}
              />
            )
          } else {
            // Render regular talk
            return (
              <ScheduledTalk
                key={`${talk.talk?._id}-${talk.startTime}-${talkIndex}`}
                talk={talk}
                talkIndex={talkIndex}
                trackIndex={trackIndex}
                onRemoveTalk={onRemoveTalk}
              />
            )
          }
        })}

        {/* Empty state */}
        {track.talks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-400">
              Drop talks here or create service sessions
            </p>
          </div>
        )}
      </div>

      {/* Service Session Modal */}
      <ServiceSessionModal
        isOpen={showServiceModal}
        timeSlot={selectedTimeSlot}
        onClose={handleCloseServiceModal}
        onSave={handleSaveServiceSession}
      />
    </div>
  )
}

// Export memoized version for better performance
export const MemoizedDroppableTrack = React.memo(DroppableTrack)
MemoizedDroppableTrack.displayName = 'MemoizedDroppableTrack'
export { MemoizedDroppableTrack as DroppableTrack }
