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
import {
  computeUnassigned,
  scheduledProposalIdsExcludingDay,
} from '@/lib/schedule/operations'
import { ProposalExisting } from '@/lib/proposal/types'
import { UnassignedProposals } from './UnassignedProposals'
import { MemoizedDroppableTrack as DroppableTrack } from './DroppableTrack'
import { DraggableProposal } from './DraggableProposal'
import { DraggableServiceSession } from './DraggableServiceSession'
import { MobileScheduleView } from './mobile'
import { HeaderSection } from './HeaderSection'
import { AddTrackModal } from './AddTrackModal'
import { ScheduleProvider } from './ScheduleContext'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { api } from '@/lib/trpc/client'
import { PlusIcon } from '@heroicons/react/24/outline'

interface ScheduleEditorProps {
  initialSchedules: ConferenceSchedule[]
  conference: Conference
  initialProposals: ProposalExisting[]
}

const PRIMARY_BUTTON =
  'inline-flex items-center gap-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600'

const LAYOUT_CLASSES = {
  container: 'flex h-[calc(100vh-5rem)]',
  mainArea: 'flex flex-1 flex-col min-h-0 min-w-0',
  content: 'flex-1 min-h-0 overflow-x-auto px-2 pt-4',
  tracksGrid: 'flex gap-4 h-max',
  emptyState: 'flex flex-1 items-center justify-center',
  errorBanner:
    'border-b border-red-200 bg-red-50 px-4 py-2 shrink-0 dark:border-red-800 dark:bg-red-900/20',
} as const

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
      <button onClick={onAddTrack} className={PRIMARY_BUTTON} type="button">
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
        />
      ))}
    </div>
  )
}

const MemoizedTracksGrid = React.memo(TracksGrid)
MemoizedTracksGrid.displayName = 'MemoizedTracksGrid'

export function ScheduleEditor({
  initialSchedules,
  initialProposals,
}: ScheduleEditorProps) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const [showAddTrackModal, setShowAddTrackModal] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Desktop is the SSR default (`true`), so wide screens never flash the mobile
  // layout and there is no hydration mismatch; phones flip to the tap-driven
  // view after mount. The two layouts are mutually exclusive so the drag board's
  // DndContext (and its touch sensors) is never mounted on a phone.
  const isDesktop = useMediaQuery('(min-width: 768px)', true)

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
          dispatch({
            type: 'saveDaySucceeded',
            index,
            _id: schedule._id,
            _rev: schedule._rev,
          })
        }
      }

      dispatch({ type: 'saveEnd' })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      // A CONFLICT means another organizer changed this day since it was loaded.
      // Don't clobber the user's in-progress edits — stop and tell them to
      // reload. Any other error keeps its original message.
      const code = (err as { data?: { code?: string } })?.data?.code
      const message =
        code === 'CONFLICT'
          ? 'This day was changed elsewhere — reload to get the latest before saving.'
          : err instanceof Error
            ? err.message
            : 'Failed to save schedule'
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

  // Ids scheduled on OTHER days — the cross-day duplicate set the reducer feeds
  // `moveProposal`. Threading it through context lets `canDrop` apply the exact
  // same guard so the indicator can't promise a drop the reducer rejects.
  const otherScheduledProposalIds = useMemo(
    () => scheduledProposalIdsExcludingDay(state.schedules, currentDayIndex),
    [state.schedules, currentDayIndex],
  )

  // Ambient board state for the leaf drop targets (see ScheduleContext): the
  // active drag, the whole current day (for the swap reverse-check), the
  // cross-day duplicate set, and dispatch.
  const scheduleContextValue = useMemo(
    () => ({
      activeDragItem: activeItem,
      schedule: currentSchedule,
      otherScheduledProposalIds,
      dispatch,
    }),
    [activeItem, currentSchedule, otherScheduledProposalIds],
  )

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

  if (!isDesktop) {
    return (
      <>
        <MobileScheduleView
          schedules={state.schedules}
          currentDayIndex={currentDayIndex}
          unassignedProposals={unassignedProposals}
          dispatch={dispatch}
          onDayChange={handleDayChange}
          onSave={handleSave}
          onAddTrack={handleShowAddTrackModal}
          isSaving={isSaving}
          saveSuccess={saveSuccess}
          error={error}
        />
        {showAddTrackModal && (
          <AddTrackModal
            onAdd={handleAddTrack}
            onCancel={handleHideAddTrackModal}
          />
        )}
      </>
    )
  }

  return (
    <div className={LAYOUT_CLASSES.container}>
      <ScheduleProvider value={scheduleContextValue}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          collisionDetection={pointerWithin}
        >
          <UnassignedProposals proposals={unassignedProposals} />

          <div className={LAYOUT_CLASSES.mainArea}>
            <HeaderSection
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
      </ScheduleProvider>

      {showAddTrackModal && (
        <AddTrackModal
          onAdd={handleAddTrack}
          onCancel={handleHideAddTrackModal}
        />
      )}
    </div>
  )
}
