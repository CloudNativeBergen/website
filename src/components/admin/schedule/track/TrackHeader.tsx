'use client'

import { useState } from 'react'
import { ScheduleTrack } from '@/lib/conference/types'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { calculateTalkContentMinutes } from '@/lib/schedule/geometry'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'

export const TrackHeader = ({
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
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  // Removing a track un-schedules its real talks (they return to the unassigned
  // list) but permanently DELETES its service sessions — mirror the mobile
  // TrackActionSheet's confirm step and wording so one click can't destroy them.
  const serviceCount = track.talks.length - realTalks
  const name = track.trackTitle || 'this track'
  const removeMessage =
    `Remove ${name}?` +
    (realTalks > 0
      ? ` Its ${realTalks} talk${realTalks === 1 ? '' : 's'} return to unassigned.`
      : '') +
    (serviceCount > 0
      ? ` ${serviceCount} service session${serviceCount === 1 ? '' : 's'} will be deleted.`
      : '')

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
          <div className="ml-3 flex shrink-0 gap-1">
            <button
              onClick={onStartEdit}
              className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-gray-500 dark:hover:text-gray-300"
              title="Edit track"
              type="button"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmingRemove(true)}
              className="rounded p-1 text-gray-400 transition-colors hover:text-red-600 focus:ring-2 focus:ring-red-500 focus:outline-none dark:text-gray-500 dark:hover:text-red-400"
              title="Remove track"
              type="button"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmingRemove}
        onClose={() => setConfirmingRemove(false)}
        onConfirm={() => {
          setConfirmingRemove(false)
          onRemoveTrack()
        }}
        title="Remove track?"
        message={removeMessage}
        confirmButtonText="Remove"
        variant="danger"
      />
    </div>
  )
}
