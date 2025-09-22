'use client'

import React, { useCallback, useMemo, useEffect, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import {
  DragItem,
  generateTimeSlots,
  TimeSlot,
  findAvailableTimeSlot,
  canSwapTalks,
} from '@/lib/schedule/types'
import { DraggableProposal } from './DraggableProposal'
import { DraggableServiceSession } from './DraggableServiceSession'
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  DocumentDuplicateIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline'

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
  onSwapHover?: (timeSlot: string | null) => void
}

interface ServiceSessionModalProps {
  isOpen: boolean
  timeSlot: string
  onClose: () => void
  onSave: (title: string, duration: number) => void
}

const SCHEDULE_CONFIG = {
  START_TIME: '08:00',
  END_TIME: '21:00',
  SLOT_INTERVAL: 5,
  PIXELS_PER_MINUTE: 2.4,
  LABEL_INTERVAL: 15,
} as const

const TRACK_CONSTRAINTS = {
  MIN_WIDTH: 320,
  MAX_WIDTH: 384,
} as const

const calculateTimePosition = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)
  const startHour = 8
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

const addMinutesToTime = (time: string, minutes: number): string => {
  const [hours, mins] = time.split(':').map(Number)
  const date = new Date(2000, 0, 1, hours, mins)
  date.setMinutes(date.getMinutes() + minutes)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

const calculateTalkContentMinutes = (track: ScheduleTrack): number => {
  return track.talks.reduce((total, talk) => {
    if (!talk.talk) return total

    const start = new Date(`2000-01-01T${talk.startTime}:00`)
    const end = new Date(`2000-01-01T${talk.endTime}:00`)
    const durationMinutes = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60),
    )

    return total + durationMinutes
  }, 0)
}

const ServiceSessionModal = ({
  isOpen,
  timeSlot,
  onClose,
  onSave,
}: ServiceSessionModalProps) => {
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(10)

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
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Create Service Session
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Starting at {timeSlot}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Session Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              placeholder="e.g., Coffee Break, Lunch, Networking"
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="duration"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Duration (minutes)
            </label>
            <select
              id="duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              Create Session
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-500 focus:outline-none dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

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
      e.stopPropagation()
      setIsResizing(true)
      setStartY(e.clientY)
      setStartHeight(position.height)
    },
    [position.height],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return

      e.preventDefault()

      const deltaY = e.clientY - startY
      const newHeight = Math.max(12, startHeight + deltaY)
      const newDuration =
        Math.round(newHeight / SCHEDULE_CONFIG.PIXELS_PER_MINUTE / 5) * 5

      if (newDuration >= 5 && newDuration <= 180) {
        onUpdateSession(talkIndex, newDuration)
      }
    },
    [isResizing, startY, startHeight, talkIndex, onUpdateSession],
  )

  const handleMouseUp = useCallback((e: MouseEvent) => {
    e.preventDefault()
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      const handleMouseMoveGlobal = (e: MouseEvent) => handleMouseMove(e)
      const handleMouseUpGlobal = (e: MouseEvent) => handleMouseUp(e)
      const handleMouseLeave = () => setIsResizing(false)

      document.addEventListener('mousemove', handleMouseMoveGlobal)
      document.addEventListener('mouseup', handleMouseUpGlobal)
      document.addEventListener('mouseleave', handleMouseLeave)

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
        <DraggableServiceSession
          serviceSession={talk}
          sourceTrackIndex={trackIndex}
          sourceTimeSlot={talk.startTime}
        />

        {isEditing && (
          <div className="absolute inset-0 z-30 rounded-md border-2 border-blue-400 bg-blue-50 p-2 dark:border-blue-500 dark:bg-blue-900/20">
            <div className="space-y-1">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveEdit}
                className="w-full rounded border border-blue-300 bg-white px-1 py-0.5 text-xs font-medium text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-blue-600 dark:bg-gray-800 dark:text-gray-300"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleSaveEdit}
                  className="rounded px-1 py-0.5 text-xs text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-800/50"
                  type="button"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="rounded px-1 py-0.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          className={`absolute right-0 bottom-0 left-0 z-20 h-2 cursor-ns-resize border-t transition-all ${
            isResizing
              ? 'border-blue-400 bg-blue-200 opacity-100 dark:border-blue-500 dark:bg-blue-800'
              : 'border-gray-400 bg-gray-200 opacity-0 group-hover:opacity-100 dark:border-gray-500 dark:bg-gray-600'
          }`}
          onMouseDown={handleMouseDown}
          title="Drag to resize"
        >
          <div
            className={`absolute inset-x-0 top-0.5 mx-auto h-0.5 w-6 rounded ${
              isResizing
                ? 'bg-blue-500 dark:bg-blue-400'
                : 'bg-gray-400 dark:bg-gray-300'
            }`}
          ></div>
        </div>

        <div className="absolute top-0.5 right-0.5 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={handleStartEdit}
            className="rounded-full bg-gray-100 p-0.5 text-gray-600 transition-colors hover:bg-gray-200 hover:opacity-100 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            title="Rename session"
            type="button"
          >
            <PencilIcon className="h-3 w-3" />
          </button>
          <button
            onClick={handleDuplicate}
            className="rounded-full bg-blue-100 p-0.5 text-blue-600 transition-colors hover:bg-blue-200 hover:opacity-100 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-800/50"
            title="Duplicate to all tracks"
            type="button"
          >
            <DocumentDuplicateIcon className="h-3 w-3" />
          </button>
          <button
            onClick={handleRemove}
            className="rounded-full bg-red-100 p-0.5 text-red-600 transition-colors hover:bg-red-200 hover:opacity-100 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-800/50"
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

const TimeSlotDropZone = ({
  timeSlot,
  trackIndex,
  track,
  activeDragItem,
  onCreateServiceSession,
  onSwapHover,
}: TimeSlotDropZoneProps) => {
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
    } else if (isOver) {
      onSwapHover(null)
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

        return canSwapTalks(
          track,
          activeDragItem.proposal,
          occupiedTalk,
          timeSlot.time,
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
  }, [activeDragItem, track, timeSlot.time, trackIndex])

  const isOccupied = useMemo(() => {
    return track.talks.some((talk) => talk.startTime === timeSlot.time)
  }, [track.talks, timeSlot.time])

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

const ScheduledTalk = ({
  talk,
  talkIndex,
  trackIndex,
  onRemoveTalk,
  activeDragItem,
  hoveredSwapTimeSlot,
}: {
  talk: TrackTalk
  talkIndex: number
  trackIndex: number
  onRemoveTalk: (index: number) => void
  activeDragItem?: DragItem | null
  hoveredSwapTimeSlot?: string | null
}) => {
  const position = useMemo(() => calculateTalkPosition(talk), [talk])

  const handleRemove = useCallback(() => {
    onRemoveTalk(talkIndex)
  }, [onRemoveTalk, talkIndex])

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
            ? 'ring-opacity-75 scale-105 transform shadow-lg ring-2 ring-amber-400'
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
  const talkContentMinutes = calculateTalkContentMinutes(track)
  const realTalks = track.talks.filter((talk) => talk.talk).length

  return (
    <div className="rounded-t-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {isEditing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onEditTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            placeholder="Track title"
            autoFocus
          />
          <textarea
            value={editDescription}
            onChange={(e) => onEditDescription(e.target.value)}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            rows={2}
            placeholder="Track description"
          />
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-blue-700 dark:hover:bg-blue-600"
              type="button"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="rounded-md bg-gray-300 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-500 focus:outline-none dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-white">
              {track.trackTitle}
            </h3>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                <span className="font-mono font-bold">
                  {talkContentMinutes}
                </span>
                <span>min content</span>
              </span>
              {realTalks > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 font-medium text-green-800 dark:bg-green-900/50 dark:text-green-300">
                  <span className="font-mono">{realTalks}</span>
                  <span>talks</span>
                </span>
              )}
            </div>
          </div>
          <div className="ml-3 flex flex-shrink-0 gap-1">
            <button
              onClick={onStartEdit}
              className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-gray-500 dark:hover:text-gray-300"
              title="Edit track"
              type="button"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              onClick={onRemoveTrack}
              className="rounded p-1 text-gray-400 transition-colors hover:text-red-600 focus:ring-2 focus:ring-red-500 focus:outline-none dark:text-gray-500 dark:hover:text-red-400"
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
  const [hoveredSwapTimeSlot, setHoveredSwapTimeSlot] = useState<string | null>(
    null,
  )

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

  const trackContainerClasses = useMemo(() => {
    const baseClasses =
      'relative rounded-b-lg border-r border-b border-l border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'
    return isOver
      ? `${baseClasses} bg-blue-50 dark:bg-blue-900/20`
      : baseClasses
  }, [isOver])

  return (
    <div
      className="flex-shrink-0"
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
            activeDragItem={activeDragItem}
            onCreateServiceSession={handleCreateServiceSession}
            onSwapHover={setHoveredSwapTimeSlot}
          />
        ))}

        {track.talks.map((talk, talkIndex) => {
          if (talk.placeholder) {
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
            return (
              <ScheduledTalk
                key={`${talk.talk?._id}-${talk.startTime}-${talkIndex}`}
                talk={talk}
                talkIndex={talkIndex}
                trackIndex={trackIndex}
                onRemoveTalk={onRemoveTalk}
                activeDragItem={activeDragItem}
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
export { MemoizedDroppableTrack as DroppableTrack }
