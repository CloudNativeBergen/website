'use client'

import './schedule.css'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
} from '@dnd-kit/core'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import React from 'react'
import {
  ScheduleTrack,
  ConferenceSchedule,
  TrackTalk,
  Conference,
} from '@/lib/conference/types'
import { DragItem } from '@/lib/schedule/types'
import { useScheduleEditor } from '@/hooks/useScheduleEditor'
import { ProposalExisting } from '@/lib/proposal/types'
import { UnassignedProposals } from './UnassignedProposals'
import { MemoizedDroppableTrack as DroppableTrack } from './DroppableTrack'
import { DraggableProposal } from './DraggableProposal'
import { DraggableServiceSession } from './DraggableServiceSession'
import { saveSchedule } from '@/lib/schedule/client'
import {
  usePerformanceTimer,
  performanceMonitor,
} from '@/lib/schedule/performance'
import { useDragPerformance } from '@/lib/schedule/performance-utils'
import {
  PlusIcon,
  BookmarkIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

interface ScheduleEditorProps {
  initialSchedules: ConferenceSchedule[]
  conference: Conference
  initialProposals: ProposalExisting[]
}

const BUTTON_STYLES = {
  primary:
    'inline-flex items-center gap-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600',
  secondary:
    'inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
  danger:
    'flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500',
}

const LAYOUT_CLASSES = {
  container: 'flex h-[calc(100vh-5rem)]',
  sidebar:
    'border-r border-gray-200 bg-gray-50 flex-shrink-0 dark:border-gray-700 dark:bg-gray-800',
  mainArea: 'flex flex-1 flex-col min-h-0 min-w-0',
  header:
    'border-b border-gray-200 bg-white px-4 py-2 flex-shrink-0 dark:border-gray-700 dark:bg-gray-900',
  content: 'flex-1 min-h-0 overflow-x-auto px-2 pt-4',
  tracksContainer: 'h-full',
  tracksGrid: 'flex gap-4 h-max',
  emptyState: 'flex flex-1 items-center justify-center',
  errorBanner:
    'border-b border-red-200 bg-red-50 px-4 py-2 flex-shrink-0 dark:border-red-800 dark:bg-red-900/20',
} as const

const HeaderSection = ({
  schedule,
  schedules,
  currentDayIndex,
  onDayChange,
  onAddTrack,
  onSave,
  isSaving,
  saveSuccess,
}: {
  schedule: ConferenceSchedule | null
  schedules: ConferenceSchedule[]
  currentDayIndex: number
  onDayChange: (index: number) => void
  onAddTrack: () => void
  onSave: () => void
  isSaving: boolean
  saveSuccess: boolean
}) => {
  const trackCount = useMemo(
    () => schedule?.tracks?.length || 0,
    [schedule?.tracks?.length],
  )

  const headerInfo = useMemo(() => {
    if (!schedule) return null
    return `${schedule.date} • ${trackCount} tracks`
  }, [schedule, trackCount])

  const dayNavigation = useMemo(() => {
    if (!schedules || schedules.length <= 1) return null

    return (
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
          {schedules.map((daySchedule, index) => {
            const isActive = index === currentDayIndex
            const dayDate = new Date(daySchedule.date)
            const dayLabel = `Day ${index + 1}`
            const dateLabel = dayDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })

            return (
              <button
                key={`day-${index}-${daySchedule.date}`}
                onClick={() => onDayChange(index)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                  isActive
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                }`}
                type="button"
              >
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold">{dayLabel}</span>
                  <span className="text-xs">{dateLabel}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }, [schedules, currentDayIndex, onDayChange])

  return (
    <div className={LAYOUT_CLASSES.header}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Schedule Editor
            </h1>
            {headerInfo && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {headerInfo}
              </p>
            )}
          </div>
          {dayNavigation}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onAddTrack}
            className={BUTTON_STYLES.secondary}
            type="button"
          >
            <PlusIcon className="h-4 w-4" />
            Track
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className={`${BUTTON_STYLES.primary} transition-all duration-300 ${
              saveSuccess
                ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                : ''
            }`}
            type="button"
          >
            {saveSuccess ? (
              <>
                <CheckCircleIcon className="h-4 w-4 animate-pulse" />
                Saved!
              </>
            ) : (
              <>
                <BookmarkIcon className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

const MemoizedHeaderSection = React.memo(HeaderSection)
MemoizedHeaderSection.displayName = 'MemoizedHeaderSection'

const ErrorBanner = React.memo(({ error }: { error: string }) => (
  <div className={LAYOUT_CLASSES.errorBanner}>
    <p className="text-red-800 dark:text-red-300">{error}</p>
  </div>
))
ErrorBanner.displayName = 'ErrorBanner'

const EmptyState = React.memo(({ onAddTrack }: { onAddTrack: () => void }) => (
  <div className={LAYOUT_CLASSES.emptyState}>
    <div className="text-center">
      <p className="mb-4 text-gray-500 dark:text-gray-400">
        No tracks created yet
      </p>
      <button
        onClick={onAddTrack}
        className={BUTTON_STYLES.primary}
        type="button"
      >
        <PlusIcon className="h-4 w-4" />
        Create First Track
      </button>
    </div>
  </div>
))
EmptyState.displayName = 'EmptyState'

const TracksGrid = ({
  tracks,
  onUpdateTrack,
  onRemoveTrack,
  onRemoveTalk,
  onDuplicateServiceSession,
  activeItem,
}: {
  tracks: ScheduleTrack[]
  onUpdateTrack: (index: number, track: ScheduleTrack) => void
  onRemoveTrack: (index: number) => void
  onRemoveTalk: (trackIndex: number, talkIndex: number) => void
  onDuplicateServiceSession: (
    serviceSession: TrackTalk,
    sourceTrackIndex: number,
  ) => void
  activeItem: DragItem | null
}) => {
  return (
    <div className={LAYOUT_CLASSES.tracksGrid}>
      {tracks.map((track, index) => (
        <DroppableTrack
          key={`track-${index}-${track.trackTitle}`}
          track={track}
          trackIndex={index}
          onUpdateTrack={(updatedTrack) => onUpdateTrack(index, updatedTrack)}
          onRemoveTrack={() => onRemoveTrack(index)}
          onRemoveTalk={(talkIndex) => onRemoveTalk(index, talkIndex)}
          onDuplicateServiceSession={onDuplicateServiceSession}
          activeDragItem={activeItem}
        />
      ))}
    </div>
  )
}

const MemoizedTracksGrid = React.memo(TracksGrid)
MemoizedTracksGrid.displayName = 'MemoizedTracksGrid'

const AddTrackModal = ({
  onAdd,
  onCancel,
}: {
  onAdd: (trackData: { title: string; description: string }) => void
  onCancel: () => void
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (title.trim()) {
        onAdd({ title: title.trim(), description: description.trim() })
      }
    },
    [title, description, onAdd],
  )

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value)
    },
    [],
  )

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(e.target.value)
    },
    [],
  )

  return (
    <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Add New Track
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Track Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={handleTitleChange}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              placeholder="e.g., Platform Engineering"
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={handleDescriptionChange}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              rows={3}
              placeholder="Track description..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              Add Track
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={BUTTON_STYLES.danger}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ScheduleEditor({
  initialSchedules,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  conference: _,
  initialProposals,
}: ScheduleEditorProps) {
  const dragTimer = usePerformanceTimer('ScheduleEditor', 'drag-operation')
  const saveTimer = usePerformanceTimer('ScheduleEditor', 'save-operation')
  const dayChangeTimer = usePerformanceTimer('ScheduleEditor', 'day-change')

  const { cancelUpdates } = useDragPerformance()

  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const [showAddTrackModal, setShowAddTrackModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentDayIndex, setCurrentDayIndex] = useState(0)

  const [modifiedSchedules, setModifiedSchedules] =
    useState<ConferenceSchedule[]>(initialSchedules)
  const hasInitialized = useRef(false)

  const scheduleEditor = useScheduleEditor()

  const currentSchedule = modifiedSchedules[currentDayIndex] || null

  useEffect(() => {
    if (
      !hasInitialized.current ||
      scheduleEditor.schedule?._id !== currentSchedule?._id
    ) {
      scheduleEditor.setInitialData(
        currentSchedule,
        initialProposals,
        modifiedSchedules,
      )
      hasInitialized.current = true
    }
  }, [currentSchedule, initialProposals, currentDayIndex, modifiedSchedules]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasInitialized.current) {
      scheduleEditor.setInitialData(
        currentSchedule,
        initialProposals,
        modifiedSchedules,
      )
    }
  }, [modifiedSchedules, currentSchedule, initialProposals, scheduleEditor])

  const handleSave = useCallback(async () => {
    if (!scheduleEditor.schedule) return

    saveTimer.start()
    setIsSaving(true)
    setError(null)
    setSaveSuccess(false)

    if (currentDayIndex >= 0 && currentDayIndex < modifiedSchedules.length) {
      setModifiedSchedules((prev) => {
        const updated = [...prev]
        updated[currentDayIndex] = { ...scheduleEditor.schedule! }
        return updated
      })
    }

    try {
      const response = await saveSchedule(scheduleEditor.schedule)

      if (response.status !== 200 || response.error) {
        throw new Error(response.error?.message || 'Failed to save schedule')
      }

      if (response.schedule) {
        scheduleEditor.setSchedule(response.schedule)
      }

      setSaveSuccess(true)
      const saveDuration = saveTimer.end()

      if (process.env.NODE_ENV === 'development') {
        console.log('Schedule save completed:', {
          duration: saveDuration,
          scheduleId: scheduleEditor.schedule._id,
          tracksCount: scheduleEditor.schedule.tracks.length,
        })
      }

      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to save schedule'
      setError(errorMessage)
      saveTimer.end()
    } finally {
      setIsSaving(false)
    }
  }, [scheduleEditor, currentDayIndex, modifiedSchedules.length, saveTimer])

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      dragTimer.start()
      const { active } = event
      setActiveItem(active.data.current as DragItem)
    },
    [dragTimer],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || !active.data.current) {
        setActiveItem(null)
        cancelUpdates()
        dragTimer.end()
        return
      }

      const dragItem = active.data.current as DragItem
      const dropData = over.data.current

      if (dropData?.type === 'time-slot') {
        if (dragItem.proposal) {
          const result = scheduleEditor.moveTalkToTrack(dragItem, {
            trackIndex: dropData.trackIndex,
            timeSlot: dropData.timeSlot,
          })

          if (result.success && result.updatedSchedule) {
            if (
              currentDayIndex >= 0 &&
              currentDayIndex < modifiedSchedules.length &&
              result.updatedSchedule
            ) {
              const updatedSchedules = [...modifiedSchedules]
              updatedSchedules[currentDayIndex] = result.updatedSchedule
              setModifiedSchedules(updatedSchedules)

              scheduleEditor.setInitialData(
                result.updatedSchedule,
                initialProposals,
                updatedSchedules,
              )
            }
          } else {
            console.warn('Failed to drop proposal:', dragItem.proposal.title)
          }
        } else if (dragItem.serviceSession) {
          const result = scheduleEditor.moveServiceSessionToTrack(dragItem, {
            trackIndex: dropData.trackIndex,
            timeSlot: dropData.timeSlot,
          })

          if (result.success && result.updatedSchedule) {
            if (
              currentDayIndex >= 0 &&
              currentDayIndex < modifiedSchedules.length &&
              result.updatedSchedule
            ) {
              const updatedSchedules = [...modifiedSchedules]
              updatedSchedules[currentDayIndex] = result.updatedSchedule
              setModifiedSchedules(updatedSchedules)

              scheduleEditor.setInitialData(
                result.updatedSchedule,
                initialProposals,
                updatedSchedules,
              )
            }
          } else {
            console.warn(
              'Failed to drop service session:',
              dragItem.serviceSession.placeholder,
            )
          }
        }
      }

      setActiveItem(null)
      const dragDuration = dragTimer.end()

      if (dragDuration && dragDuration > 100) {
        console.warn('Slow drag operation detected:', {
          duration: dragDuration,
          operation: 'drag-and-drop',
          component: 'ScheduleEditor',
        })
      }
    },
    [
      scheduleEditor,
      currentDayIndex,
      modifiedSchedules,
      initialProposals,
      dragTimer,
      cancelUpdates,
    ],
  )

  const handleAddTrack = useCallback(
    (trackData: { title: string; description: string }) => {
      const newTrack: ScheduleTrack = {
        trackTitle: trackData.title,
        trackDescription: trackData.description,
        talks: [],
      }
      scheduleEditor.addTrack(newTrack)

      if (
        currentDayIndex >= 0 &&
        currentDayIndex < modifiedSchedules.length &&
        scheduleEditor.schedule
      ) {
        setModifiedSchedules((prev) => {
          const updated = [...prev]
          const currentSchedule = updated[currentDayIndex]
          if (currentSchedule) {
            updated[currentDayIndex] = {
              ...currentSchedule,
              tracks: [...(currentSchedule.tracks || []), newTrack],
            }
          }
          return updated
        })
      }

      setShowAddTrackModal(false)
    },
    [scheduleEditor, currentDayIndex, modifiedSchedules.length],
  )

  const handleShowAddTrackModal = useCallback(() => {
    setShowAddTrackModal(true)
  }, [])

  const handleHideAddTrackModal = useCallback(() => {
    setShowAddTrackModal(false)
  }, [])

  const handleDayChange = useCallback(
    (dayIndex: number) => {
      if (dayIndex >= 0 && dayIndex < modifiedSchedules.length) {
        dayChangeTimer.start()

        if (
          scheduleEditor.schedule &&
          currentDayIndex >= 0 &&
          currentDayIndex < modifiedSchedules.length
        ) {
          setModifiedSchedules((prev) => {
            const updated = [...prev]
            updated[currentDayIndex] = { ...scheduleEditor.schedule! }
            return updated
          })
        }

        setCurrentDayIndex(dayIndex)

        setSaveSuccess(false)
        setError(null)

        const dayChangeDuration = dayChangeTimer.end()

        if (
          process.env.NODE_ENV === 'development' &&
          dayChangeDuration &&
          dayChangeDuration > 200
        ) {
          console.warn('Slow day change detected:', {
            duration: dayChangeDuration,
            fromDay: currentDayIndex,
            toDay: dayIndex,
          })
        }
      }
    },
    [
      currentDayIndex,
      modifiedSchedules,
      scheduleEditor.schedule,
      setModifiedSchedules,
      setSaveSuccess,
      setError,
      dayChangeTimer,
    ],
  )

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        const metrics = performanceMonitor.getMetrics()
        if (metrics.length > 0) {
          const avgDragTime = performanceMonitor.getAverageTime(
            'drag-operation',
            'ScheduleEditor',
          )
          const avgSaveTime = performanceMonitor.getAverageTime(
            'save-operation',
            'ScheduleEditor',
          )
          const avgDayChangeTime = performanceMonitor.getAverageTime(
            'day-change',
            'ScheduleEditor',
          )

          console.log('ScheduleEditor Performance Metrics:', {
            totalOperations: metrics.length,
            averageDragTime: avgDragTime
              ? `${avgDragTime.toFixed(2)}ms`
              : 'N/A',
            averageSaveTime: avgSaveTime
              ? `${avgSaveTime.toFixed(2)}ms`
              : 'N/A',
            averageDayChangeTime: avgDayChangeTime
              ? `${avgDayChangeTime.toFixed(2)}ms`
              : 'N/A',
          })
        }
      }, 30000)

      return () => clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    return () => {
      cancelUpdates()
    }
  }, [cancelUpdates])

  const handleUpdateTrack = useCallback(
    (index: number, track: ScheduleTrack) => {
      scheduleEditor.updateTrack(index, track)

      if (currentDayIndex >= 0 && currentDayIndex < modifiedSchedules.length) {
        const updatedSchedules = [...modifiedSchedules]
        const currentSchedule = updatedSchedules[currentDayIndex]
        if (currentSchedule?.tracks) {
          const updatedTracks = [...currentSchedule.tracks]
          updatedTracks[index] = track
          updatedSchedules[currentDayIndex] = {
            ...currentSchedule,
            tracks: updatedTracks,
          }
          setModifiedSchedules(updatedSchedules)

          scheduleEditor.setInitialData(
            updatedSchedules[currentDayIndex],
            initialProposals,
            updatedSchedules,
          )
        }
      }
    },
    [scheduleEditor, currentDayIndex, modifiedSchedules, initialProposals],
  )

  const handleRemoveTrack = useCallback(
    (index: number) => {
      scheduleEditor.removeTrack(index)

      if (currentDayIndex >= 0 && currentDayIndex < modifiedSchedules.length) {
        const updatedSchedules = [...modifiedSchedules]
        const currentSchedule = updatedSchedules[currentDayIndex]
        if (currentSchedule?.tracks) {
          const updatedTracks = currentSchedule.tracks.filter(
            (_, i) => i !== index,
          )
          updatedSchedules[currentDayIndex] = {
            ...currentSchedule,
            tracks: updatedTracks,
          }
          setModifiedSchedules(updatedSchedules)

          scheduleEditor.setInitialData(
            updatedSchedules[currentDayIndex],
            initialProposals,
            updatedSchedules,
          )
        }
      }
    },
    [scheduleEditor, currentDayIndex, modifiedSchedules, initialProposals],
  )

  const handleRemoveTalk = useCallback(
    (trackIndex: number, talkIndex: number) => {
      scheduleEditor.removeTalkFromSchedule(trackIndex, talkIndex)

      if (currentDayIndex >= 0 && currentDayIndex < modifiedSchedules.length) {
        setModifiedSchedules((prev) => {
          const updated = [...prev]
          const currentSchedule = updated[currentDayIndex]
          if (currentSchedule?.tracks?.[trackIndex]) {
            const updatedTracks = [...currentSchedule.tracks]
            const updatedTrack = { ...updatedTracks[trackIndex] }
            updatedTrack.talks = updatedTrack.talks.filter(
              (_, i) => i !== talkIndex,
            )
            updatedTracks[trackIndex] = updatedTrack
            updated[currentDayIndex] = {
              ...currentSchedule,
              tracks: updatedTracks,
            }
          }
          return updated
        })
      }
    },
    [scheduleEditor, currentDayIndex, modifiedSchedules.length],
  )

  const { schedule, unassignedProposals } = scheduleEditor

  const handleDuplicateServiceSession = useCallback(
    (serviceSession: TrackTalk, sourceTrackIndex: number) => {
      if (!schedule?.tracks) return

      const conflictingTracks: number[] = []

      schedule.tracks.forEach((track, trackIndex) => {
        if (trackIndex === sourceTrackIndex) return

        const hasConflict = track.talks.some((talk) => {
          const sessionStart = new Date(
            `2000-01-01T${serviceSession.startTime}:00`,
          )
          const sessionEnd = new Date(`2000-01-01T${serviceSession.endTime}:00`)
          const talkStart = new Date(`2000-01-01T${talk.startTime}:00`)
          const talkEnd = new Date(`2000-01-01T${talk.endTime}:00`)

          return sessionStart < talkEnd && talkStart < sessionEnd
        })

        if (hasConflict) {
          conflictingTracks.push(trackIndex)
        }
      })

      if (conflictingTracks.length > 0) {
      }

      const updatedTracks = schedule.tracks.map((track, trackIndex) => {
        if (trackIndex === sourceTrackIndex) return track

        const newTrack = {
          ...track,
          talks: [...track.talks, { ...serviceSession }].sort((a, b) => {
            return a.startTime.localeCompare(b.startTime)
          }),
        }

        return newTrack
      })

      updatedTracks.forEach((track, index) => {
        if (index !== sourceTrackIndex) {
          scheduleEditor.updateTrack(index, track)
        }
      })
    },
    [schedule, scheduleEditor],
  )

  const hasTracks = useMemo(() => {
    return schedule?.tracks && schedule.tracks.length > 0
  }, [schedule?.tracks])

  const dragOverlay = useMemo(() => {
    if (!activeItem) return null

    if (activeItem.proposal) {
      return <DraggableProposal proposal={activeItem.proposal} isDragging />
    } else if (activeItem.serviceSession) {
      return (
        <DraggableServiceSession
          serviceSession={activeItem.serviceSession}
          isDragging
        />
      )
    }

    return null
  }, [activeItem])

  return (
    <div className={LAYOUT_CLASSES.container}>
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        <UnassignedProposals proposals={unassignedProposals} />

        <div className={LAYOUT_CLASSES.mainArea}>
          <MemoizedHeaderSection
            schedule={scheduleEditor.schedule}
            schedules={modifiedSchedules}
            currentDayIndex={currentDayIndex}
            onDayChange={handleDayChange}
            onAddTrack={handleShowAddTrackModal}
            onSave={handleSave}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
          />

          {error && <ErrorBanner error={error} />}

          <div className={LAYOUT_CLASSES.content}>
            {hasTracks ? (
              <MemoizedTracksGrid
                tracks={schedule!.tracks!}
                onUpdateTrack={handleUpdateTrack}
                onRemoveTrack={handleRemoveTrack}
                onRemoveTalk={handleRemoveTalk}
                onDuplicateServiceSession={handleDuplicateServiceSession}
                activeItem={activeItem}
              />
            ) : (
              <EmptyState onAddTrack={handleShowAddTrackModal} />
            )}
          </div>
        </div>

        <DragOverlay>{dragOverlay}</DragOverlay>
      </DndContext>

      {showAddTrackModal && (
        <AddTrackModal
          onAdd={handleAddTrack}
          onCancel={handleHideAddTrackModal}
        />
      )}
    </div>
  )
}
