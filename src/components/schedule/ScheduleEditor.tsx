'use client'

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
} from '@dnd-kit/core'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { ScheduleTrack, ConferenceSchedule } from '@/lib/conference/types'
import { DragItem } from '@/lib/schedule/types'
import { useScheduleEditor } from '@/hooks/useScheduleEditor'
import { ProposalExisting } from '@/lib/proposal/types'
import { UnassignedProposals } from './UnassignedProposals'
import { DroppableTrack } from './DroppableTrack'
import { DraggableProposal } from './DraggableProposal'
import { PlusIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'

interface ScheduleEditorProps {
  initialSchedule: ConferenceSchedule | null
  initialProposals: ProposalExisting[]
}

// Constants for better maintainability
const BUTTON_STYLES = {
  primary:
    'inline-flex items-center gap-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50',
  secondary:
    'inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500',
  danger:
    'flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500',
} as const

const LAYOUT_CLASSES = {
  container: 'flex h-full',
  sidebar: 'border-r border-gray-200 bg-gray-50',
  mainArea: 'flex flex-1 flex-col',
  header: 'border-b border-gray-200 bg-white p-4',
  content: 'flex-1 overflow-auto',
  tracksContainer: 'p-4',
  tracksGrid: 'flex min-h-full gap-4',
  emptyState: 'flex flex-1 items-center justify-center',
  errorBanner: 'border-b border-red-200 bg-red-50 p-4',
} as const

// Memoized HeaderSection component
const HeaderSection = ({
  schedule,
  onAddTrack,
  onSave,
  isSaving,
}: {
  schedule: ConferenceSchedule | null
  onAddTrack: () => void
  onSave: () => void
  isSaving: boolean
}) => {
  const trackCount = useMemo(
    () => schedule?.tracks?.length || 0,
    [schedule?.tracks?.length],
  )

  const headerInfo = useMemo(() => {
    if (!schedule) return null
    return `${schedule.date} • ${trackCount} tracks`
  }, [schedule, trackCount])

  return (
    <div className={LAYOUT_CLASSES.header}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Schedule Editor
          </h1>
          {headerInfo && (
            <p className="mt-1 text-sm text-gray-600">{headerInfo}</p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onAddTrack}
            className={BUTTON_STYLES.secondary}
            type="button"
          >
            <PlusIcon className="h-4 w-4" />
            Add Track
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className={BUTTON_STYLES.primary}
            type="button"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Memoized ErrorBanner component
const ErrorBanner = ({ error }: { error: string }) => (
  <div className={LAYOUT_CLASSES.errorBanner}>
    <p className="text-red-800">{error}</p>
  </div>
)

// Memoized EmptyState component
const EmptyState = ({ onAddTrack }: { onAddTrack: () => void }) => (
  <div className={LAYOUT_CLASSES.emptyState}>
    <div className="text-center">
      <p className="mb-4 text-gray-500">No tracks created yet</p>
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
)

// Memoized TracksGrid component
const TracksGrid = ({
  tracks,
  onUpdateTrack,
  onRemoveTrack,
  onRemoveTalk,
  activeItem,
}: {
  tracks: ScheduleTrack[]
  onUpdateTrack: (index: number, track: ScheduleTrack) => void
  onRemoveTrack: (index: number) => void
  onRemoveTalk: (trackIndex: number, talkIndex: number) => void
  activeItem: DragItem | null
}) => {
  return (
    <div className={LAYOUT_CLASSES.tracksContainer}>
      <div className={LAYOUT_CLASSES.tracksGrid}>
        {tracks.map((track, index) => (
          <DroppableTrack
            key={`track-${index}-${track.trackTitle}`} // More stable key
            track={track}
            trackIndex={index}
            onUpdateTrack={(updatedTrack) => onUpdateTrack(index, updatedTrack)}
            onRemoveTrack={() => onRemoveTrack(index)}
            onRemoveTalk={(talkIndex) => onRemoveTalk(index, talkIndex)}
            activeDragItem={activeItem}
          />
        ))}
      </div>
    </div>
  )
}

// Memoized AddTrackModal component
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
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Add New Track
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Track Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={handleTitleChange}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g., Platform Engineering"
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={handleDescriptionChange}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              placeholder="Track description..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
  initialSchedule,
  initialProposals,
}: ScheduleEditorProps) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const [showAddTrackModal, setShowAddTrackModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasInitialized = useRef(false)

  const scheduleEditor = useScheduleEditor()

  // Initialize data when component mounts or when initial data changes
  useEffect(() => {
    if (
      !hasInitialized.current ||
      scheduleEditor.schedule?._id !== initialSchedule?._id
    ) {
      scheduleEditor.setInitialData(initialSchedule, initialProposals)
      hasInitialized.current = true
    }
  }, [initialSchedule, initialProposals]) // eslint-disable-line react-hooks/exhaustive-deps

  // Memoized event handlers
  const handleSave = useCallback(async () => {
    if (!scheduleEditor.schedule) return

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scheduleEditor.schedule),
      })

      if (!response.ok) {
        throw new Error('Failed to save schedule')
      }

      // Optionally show success message
      console.log('Schedule saved successfully')
    } catch (err) {
      setError('Failed to save schedule')
      console.error('Error saving schedule:', err)
    } finally {
      setIsSaving(false)
    }
  }, [scheduleEditor.schedule])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    setActiveItem(active.data.current as DragItem)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || !active.data.current) {
        setActiveItem(null)
        return
      }

      const dragItem = active.data.current as DragItem
      const dropData = over.data.current

      if (dropData?.type === 'time-slot') {
        const success = scheduleEditor.moveTalkToTrack(dragItem, {
          trackIndex: dropData.trackIndex,
          timeSlot: dropData.timeSlot,
        })

        if (!success) {
          // Handle failed drop (show notification, etc.)
          console.warn('Could not place talk at this time due to conflicts')
        }
      }

      setActiveItem(null)
    },
    [scheduleEditor],
  )

  const handleAddTrack = useCallback(
    (trackData: { title: string; description: string }) => {
      const newTrack: ScheduleTrack = {
        trackTitle: trackData.title,
        trackDescription: trackData.description,
        talks: [],
      }
      scheduleEditor.addTrack(newTrack)
      setShowAddTrackModal(false)
    },
    [scheduleEditor],
  )

  const handleShowAddTrackModal = useCallback(() => {
    setShowAddTrackModal(true)
  }, [])

  const handleHideAddTrackModal = useCallback(() => {
    setShowAddTrackModal(false)
  }, [])

  const handleUpdateTrack = useCallback(
    (index: number, track: ScheduleTrack) => {
      scheduleEditor.updateTrack(index, track)
    },
    [scheduleEditor],
  )

  const handleRemoveTrack = useCallback(
    (index: number) => {
      scheduleEditor.removeTrack(index)
    },
    [scheduleEditor],
  )

  const handleRemoveTalk = useCallback(
    (trackIndex: number, talkIndex: number) => {
      scheduleEditor.removeTalkFromSchedule(trackIndex, talkIndex)
    },
    [scheduleEditor],
  )

  // Memoized data
  const { schedule, unassignedProposals } = scheduleEditor

  const hasTracks = useMemo(() => {
    return schedule?.tracks && schedule.tracks.length > 0
  }, [schedule?.tracks])

  const dragOverlay = useMemo(() => {
    if (!activeItem) return null
    return <DraggableProposal proposal={activeItem.proposal} isDragging />
  }, [activeItem])

  return (
    <div className={LAYOUT_CLASSES.container}>
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        {/* Sidebar with unassigned proposals */}
        <UnassignedProposals proposals={unassignedProposals} />

        {/* Main schedule area */}
        <div className={LAYOUT_CLASSES.mainArea}>
          {/* Header with actions */}
          <HeaderSection
            schedule={schedule}
            onAddTrack={handleShowAddTrackModal}
            onSave={handleSave}
            isSaving={isSaving}
          />

          {/* Error display */}
          {error && <ErrorBanner error={error} />}

          {/* Schedule tracks */}
          <div className={LAYOUT_CLASSES.content}>
            {hasTracks ? (
              <TracksGrid
                tracks={schedule!.tracks!}
                onUpdateTrack={handleUpdateTrack}
                onRemoveTrack={handleRemoveTrack}
                onRemoveTalk={handleRemoveTalk}
                activeItem={activeItem}
              />
            ) : (
              <EmptyState onAddTrack={handleShowAddTrackModal} />
            )}
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>{dragOverlay}</DragOverlay>
      </DndContext>

      {/* Add Track Modal */}
      {showAddTrackModal && (
        <AddTrackModal
          onAdd={handleAddTrack}
          onCancel={handleHideAddTrackModal}
        />
      )}
    </div>
  )
}
