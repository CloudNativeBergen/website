'use client'

import './schedule.css'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
} from '@dnd-kit/core'
import { useState, useReducer, useMemo, useCallback } from 'react'
import React from 'react'
import {
  ScheduleTrack,
  ConferenceSchedule,
  TrackTalk,
  Conference,
} from '@/lib/conference/types'
import { DragItem } from '@/lib/schedule/types'
import {
  scheduleReducer,
  initScheduleEditorState,
} from '@/lib/schedule/reducer'
import { computeUnassigned } from '@/lib/schedule/operations'
import { ProposalExisting } from '@/lib/proposal/types'
import { UnassignedProposals } from './UnassignedProposals'
import { MemoizedDroppableTrack as DroppableTrack } from './DroppableTrack'
import { DraggableProposal } from './DraggableProposal'
import { DraggableServiceSession } from './DraggableServiceSession'
import { api } from '@/lib/trpc/client'
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
    'border-r border-gray-200 bg-gray-50 shrink-0 dark:border-gray-700 dark:bg-gray-800',
  mainArea: 'flex flex-1 flex-col min-h-0 min-w-0',
  header:
    'border-b border-gray-200 bg-white px-4 py-2 shrink-0 dark:border-gray-700 dark:bg-gray-900',
  content: 'flex-1 min-h-0 overflow-x-auto px-2 pt-4',
  tracksContainer: 'h-full',
  tracksGrid: 'flex gap-4 h-max',
  emptyState: 'flex flex-1 items-center justify-center',
  errorBanner:
    'border-b border-red-200 bg-red-50 px-4 py-2 shrink-0 dark:border-red-800 dark:bg-red-900/20',
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
  onAddServiceSession,
  onResizeServiceSession,
  onRenameServiceSession,
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
  onAddServiceSession: (
    trackIndex: number,
    startTime: string,
    title: string,
    duration: number,
  ) => void
  onResizeServiceSession: (
    trackIndex: number,
    talkIndex: number,
    duration: number,
  ) => void
  onRenameServiceSession: (
    trackIndex: number,
    talkIndex: number,
    title: string,
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
          onAddServiceSession={(startTime, title, duration) =>
            onAddServiceSession(index, startTime, title, duration)
          }
          onResizeServiceSession={(talkIndex, duration) =>
            onResizeServiceSession(index, talkIndex, duration)
          }
          onRenameServiceSession={(talkIndex, title) =>
            onRenameServiceSession(index, talkIndex, title)
          }
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
  initialProposals,
}: ScheduleEditorProps) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const [showAddTrackModal, setShowAddTrackModal] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const saveMutation = api.schedule.save.useMutation()

  // Single reducer over ALL days. The active day is `state.currentDayIndex`
  // (identity), never an `_id` — see reducer.ts for why that fixes the
  // day-collision bug. There is no second store to hand-sync.
  const [state, dispatch] = useReducer(
    scheduleReducer,
    { schedules: initialSchedules, proposals: initialProposals },
    initScheduleEditorState,
  )

  const currentDayIndex = state.currentDayIndex
  const currentSchedule = state.schedules[currentDayIndex] ?? null
  const isSaving = state.ui.isSaving
  const error = state.ui.error

  // Unassigned proposals are DERIVED from all days, never stored.
  const unassignedProposals = useMemo(
    () => computeUnassigned(state.proposals, state.schedules),
    [state.proposals, state.schedules],
  )

  const handleSave = useCallback(async () => {
    dispatch({ type: 'saveStart' })
    setSaveSuccess(false)

    // Persist every DIRTY day so edits on non-current days are not dropped. If
    // nothing is dirty, fall back to saving the current day (matches the old
    // always-save-current behaviour).
    const dirtyIndices = state.dirty
      .map((isDirty, index) => (isDirty ? index : -1))
      .filter((index) => index >= 0)
    const indicesToSave =
      dirtyIndices.length > 0 ? dirtyIndices : [currentDayIndex]

    try {
      for (const index of indicesToSave) {
        const daySchedule = state.schedules[index]
        if (!daySchedule) continue

        const { schedule } = await saveMutation.mutateAsync(daySchedule)
        if (schedule) {
          dispatch({ type: 'saveDaySucceeded', index, _id: schedule._id })
        }
      }

      dispatch({ type: 'saveEnd' })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save schedule'
      dispatch({ type: 'saveError', message })
    }
  }, [state.dirty, state.schedules, currentDayIndex, saveMutation])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    setActiveItem(active.data.current as DragItem)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (!over || !active.data.current) {
      setActiveItem(null)
      return
    }

    const dragItem = active.data.current as DragItem
    const dropData = over.data.current

    if (dropData?.type === 'time-slot') {
      const dropPosition = {
        trackIndex: dropData.trackIndex,
        timeSlot: dropData.timeSlot,
      }
      if (dragItem.proposal) {
        dispatch({ type: 'moveProposal', dragItem, dropPosition })
      } else if (dragItem.serviceSession) {
        dispatch({ type: 'moveService', dragItem, dropPosition })
      }
    }

    setActiveItem(null)
  }, [])

  const handleAddTrack = useCallback(
    (trackData: { title: string; description: string }) => {
      const newTrack: ScheduleTrack = {
        trackTitle: trackData.title,
        trackDescription: trackData.description,
        talks: [],
      }
      dispatch({ type: 'addTrack', track: newTrack })
      setShowAddTrackModal(false)
    },
    [],
  )

  const handleShowAddTrackModal = useCallback(() => {
    setShowAddTrackModal(true)
  }, [])

  const handleHideAddTrackModal = useCallback(() => {
    setShowAddTrackModal(false)
  }, [])

  const handleDayChange = useCallback((dayIndex: number) => {
    dispatch({ type: 'changeDay', dayIndex })
    setSaveSuccess(false)
  }, [])

  const handleUpdateTrack = useCallback(
    (index: number, track: ScheduleTrack) => {
      dispatch({ type: 'updateTrack', trackIndex: index, track })
    },
    [],
  )

  const handleRemoveTrack = useCallback((index: number) => {
    dispatch({ type: 'removeTrack', trackIndex: index })
  }, [])

  const handleRemoveTalk = useCallback(
    (trackIndex: number, talkIndex: number) => {
      dispatch({ type: 'removeTalk', trackIndex, talkIndex })
    },
    [],
  )

  const handleAddServiceSession = useCallback(
    (
      trackIndex: number,
      startTime: string,
      title: string,
      duration: number,
    ) => {
      dispatch({ type: 'addService', trackIndex, startTime, title, duration })
    },
    [],
  )

  const handleResizeServiceSession = useCallback(
    (trackIndex: number, talkIndex: number, duration: number) => {
      dispatch({ type: 'resizeService', trackIndex, talkIndex, duration })
    },
    [],
  )

  const handleRenameServiceSession = useCallback(
    (trackIndex: number, talkIndex: number, title: string) => {
      dispatch({ type: 'renameService', trackIndex, talkIndex, title })
    },
    [],
  )

  const schedule = currentSchedule

  const handleDuplicateServiceSession = useCallback(
    (serviceSession: TrackTalk, sourceTrackIndex: number) => {
      dispatch({ type: 'duplicateService', serviceSession, sourceTrackIndex })
    },
    [],
  )

  const hasTracks = Boolean(schedule?.tracks && schedule.tracks.length > 0)

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

  // Explicit sensors so touch drag coexists with scrolling. Without any sensors
  // dnd-kit's default PointerSensor has NO activation constraint, so on a phone
  // the first move of a scroll swipe starts a drag and the board/list can't be
  // scrolled. Mouse drags stay instant (tiny distance); touch requires a short
  // press-and-hold (delay) so a quick swipe scrolls instead of dragging.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  )

  return (
    <div className={LAYOUT_CLASSES.container}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        <UnassignedProposals proposals={unassignedProposals} />

        <div className={LAYOUT_CLASSES.mainArea}>
          <MemoizedHeaderSection
            schedule={currentSchedule}
            schedules={state.schedules}
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
                onAddServiceSession={handleAddServiceSession}
                onResizeServiceSession={handleResizeServiceSession}
                onRenameServiceSession={handleRenameServiceSession}
                activeItem={activeItem}
              />
            ) : (
              <EmptyState onAddTrack={handleShowAddTrackModal} />
            )}
          </div>
        </div>

        {/* dropAnimation={null}: on a successful drop the source card unmounts
            (the talk moves to its new slot / leaves the sidebar), so dnd-kit's
            default animation of the overlay BACK to the origin rect reads as a
            snap-back/"didn't take" even though the move succeeded. */}
        <DragOverlay dropAnimation={null}>{dragOverlay}</DragOverlay>
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
