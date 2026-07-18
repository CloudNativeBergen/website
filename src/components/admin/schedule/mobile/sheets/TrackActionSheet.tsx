'use client'

import React, { useState } from 'react'
import { ScheduleTrack } from '@/lib/conference/types'
import { ScheduleAction } from '@/lib/schedule/reducer'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'

import { BottomSheet } from '../BottomSheet'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../constants'

/* -------------------------------------------------------------------------- */
/* Track action sheet (rename / remove a track)                               */
/* -------------------------------------------------------------------------- */

export function TrackActionSheet({
  track,
  trackIndex,
  dispatch,
  onClose,
}: {
  track: ScheduleTrack
  trackIndex: number
  dispatch: React.Dispatch<ScheduleAction>
  onClose: () => void
}) {
  const [mode, setMode] = useState<'menu' | 'rename' | 'confirmRemove'>('menu')
  const [title, setTitle] = useState(track.trackTitle ?? '')
  const [description, setDescription] = useState(track.trackDescription ?? '')
  const name = track.trackTitle || `Track ${trackIndex + 1}`
  // Removing a track un-schedules its real talks (they return to the unassigned
  // list) but permanently DELETES its service sessions — word the confirm
  // accordingly so it doesn't overstate recoverability.
  const talkCount = track.talks.filter((t) => t.talk).length
  const serviceCount = track.talks.length - talkCount
  const action =
    'inline-flex min-h-[44px] w-full items-center justify-start gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

  if (mode === 'rename') {
    const save = () => {
      if (!title.trim()) return
      dispatch({
        type: 'updateTrack',
        trackIndex,
        track: {
          ...track,
          trackTitle: title.trim(),
          trackDescription: description.trim(),
        },
      })
      onClose()
    }
    return (
      <BottomSheet title="Edit track" onClose={onClose}>
        <label
          htmlFor="track-title"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Track name
        </label>
        <input
          id="track-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          autoFocus
        />
        <label
          htmlFor="track-description"
          className="mt-4 mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Description (optional)
        </label>
        <input
          id="track-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!title.trim()}
            className={`flex-1 ${PRIMARY_BUTTON}`}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setMode('menu')}
            className={`flex-1 ${SECONDARY_BUTTON}`}
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    )
  }

  if (mode === 'confirmRemove') {
    return (
      <BottomSheet title="Remove track?" onClose={onClose}>
        <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
          Remove <span className="font-semibold">{name}</span>?
          {talkCount > 0 &&
            ` Its ${talkCount} talk${talkCount === 1 ? '' : 's'} return to unassigned.`}
          {serviceCount > 0 &&
            ` ${serviceCount} service session${serviceCount === 1 ? '' : 's'} will be deleted.`}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'removeTrack', trackIndex })
              onClose()
            }}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          >
            <TrashIcon className="h-5 w-5" />
            Remove
          </button>
          <button
            type="button"
            onClick={() => setMode('menu')}
            className={`flex-1 ${SECONDARY_BUTTON}`}
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet title={name} onClose={onClose}>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setMode('rename')}
          className={action}
        >
          <PencilIcon className="h-5 w-5" />
          Rename track
        </button>
        <button
          type="button"
          onClick={() => setMode('confirmRemove')}
          className="inline-flex min-h-[44px] w-full items-center justify-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
        >
          <TrashIcon className="h-5 w-5" />
          Remove track
        </button>
      </div>
    </BottomSheet>
  )
}
