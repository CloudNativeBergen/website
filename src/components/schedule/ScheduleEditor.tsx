'use client'

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
} from '@dnd-kit/core'
import { useEffect, useState, useRef } from 'react'
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
    if (!hasInitialized.current || 
        scheduleEditor.schedule?._id !== initialSchedule?._id) {
      scheduleEditor.setInitialData(initialSchedule, initialProposals)
      hasInitialized.current = true
    }
  }, [initialSchedule, initialProposals]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
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
  }

  const {
    schedule,
    unassignedProposals,
    addTrack,
    removeTrack,
    updateTrack,
    moveTalkToTrack,
    removeTalkFromSchedule,
  } = scheduleEditor

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    setActiveItem(active.data.current as DragItem)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over || !active.data.current) {
      setActiveItem(null)
      return
    }

    const dragItem = active.data.current as DragItem
    const dropData = over.data.current

    if (dropData?.type === 'time-slot') {
      const success = moveTalkToTrack(dragItem, {
        trackIndex: dropData.trackIndex,
        timeSlot: dropData.timeSlot,
      })

      if (!success) {
        // Handle failed drop (show notification, etc.)
        console.warn('Could not place talk at this time due to conflicts')
      }
    }

    setActiveItem(null)
  }

  const handleAddTrack = (trackData: {
    title: string
    description: string
  }) => {
    const newTrack: ScheduleTrack = {
      trackTitle: trackData.title,
      trackDescription: trackData.description,
      talks: [],
    }
    addTrack(newTrack)
    setShowAddTrackModal(false)
  }

  return (
    <div className="flex h-full">
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        {/* Sidebar with unassigned proposals */}
        <UnassignedProposals proposals={unassignedProposals} />

        {/* Main schedule area */}
        <div className="flex flex-1 flex-col">
          {/* Header with actions */}
          <div className="border-b border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Schedule Editor
                </h1>
                {schedule && (
                  <p className="mt-1 text-sm text-gray-600">
                    {schedule.date} • {schedule.tracks?.length || 0} tracks
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddTrackModal(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Track
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  {isSaving ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="border-b border-red-200 bg-red-50 p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Schedule tracks */}
          <div className="flex-1 overflow-auto">
            {schedule && schedule.tracks && schedule.tracks.length > 0 ? (
              <div className="p-4">
                <div className="flex min-h-full gap-4">
                  {schedule.tracks.map((track, index) => (
                    <DroppableTrack
                      key={index}
                      track={track}
                      trackIndex={index}
                      onUpdateTrack={(updatedTrack) =>
                        updateTrack(index, updatedTrack)
                      }
                      onRemoveTrack={() => removeTrack(index)}
                      onRemoveTalk={(talkIndex) =>
                        removeTalkFromSchedule(index, talkIndex)
                      }
                      activeDragItem={activeItem}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <p className="mb-4 text-gray-500">No tracks created yet</p>
                  <button
                    onClick={() => setShowAddTrackModal(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Create First Track
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeItem && (
            <DraggableProposal proposal={activeItem.proposal} isDragging />
          )}
        </DragOverlay>
      </DndContext>

      {/* Add Track Modal */}
      {showAddTrackModal && (
        <AddTrackModal
          onAdd={handleAddTrack}
          onCancel={() => setShowAddTrackModal(false)}
        />
      )}
    </div>
  )
}

interface AddTrackModalProps {
  onAdd: (trackData: { title: string; description: string }) => void
  onCancel: () => void
}

function AddTrackModal({ onAdd, onCancel }: AddTrackModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim()) {
      onAdd({ title: title.trim(), description: description.trim() })
    }
  }

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
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g., Platform Engineering"
              required
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
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              placeholder="Track description..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add Track
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
