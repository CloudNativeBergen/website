'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import {
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import { calculateTalkPosition } from '@/lib/schedule/geometry'
import { DraggableServiceSession } from '../DraggableServiceSession'
import { useServiceSessionResize } from './useServiceSessionResize'

export const ServiceSession = ({
  talk,
  talkIndex,
  trackIndex,
  track,
  onRemoveTalk,
  onUpdateSession,
  onRenameSession,
  onDuplicate,
}: {
  talk: TrackTalk
  talkIndex: number
  trackIndex: number
  track: ScheduleTrack
  onRemoveTalk: (index: number) => void
  onUpdateSession: (index: number, newDuration: number) => void
  onRenameSession: (index: number, newTitle: string) => void
  onDuplicate: (talk: TrackTalk) => void
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(talk.placeholder || '')

  const position = useMemo(() => calculateTalkPosition(talk), [talk])

  const {
    isResizing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useServiceSessionResize({
    talk,
    talkIndex,
    track,
    height: position.height,
    onUpdateSession,
  })

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
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
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
