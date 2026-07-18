'use client'

import React, { useCallback, useState } from 'react'
import { TrackTalk } from '@/lib/conference/types'
import { ScheduleAction } from '@/lib/schedule/reducer'
import { durationBetween } from '@/lib/schedule/time'
import { SERVICE_DURATION_OPTIONS } from '@/lib/schedule/constants'
import { Dropdown } from '@/components/Form'

import { BottomSheet } from '../BottomSheet'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../constants'

/* -------------------------------------------------------------------------- */
/* Service edit sheet (rename / duration)                                     */
/* -------------------------------------------------------------------------- */

export function ServiceEditSheet({
  talk,
  trackIndex,
  talkIndex,
  mode,
  dispatch,
  onClose,
}: {
  talk: TrackTalk
  trackIndex: number
  talkIndex: number
  mode: 'rename' | 'duration'
  dispatch: React.Dispatch<ScheduleAction>
  onClose: () => void
}) {
  const [renameValue, setRenameValue] = useState(talk.placeholder ?? '')
  const [durationValue, setDurationValue] = useState(
    String(durationBetween(talk.startTime, talk.endTime)),
  )

  const saveRename = useCallback(() => {
    if (!renameValue.trim()) return
    dispatch({
      type: 'renameService',
      trackIndex,
      talkIndex,
      title: renameValue.trim(),
    })
    onClose()
  }, [dispatch, trackIndex, talkIndex, renameValue, onClose])

  const saveDuration = useCallback(() => {
    dispatch({
      type: 'resizeService',
      trackIndex,
      talkIndex,
      duration: Number(durationValue),
    })
    onClose()
  }, [dispatch, trackIndex, talkIndex, durationValue, onClose])

  if (mode === 'rename') {
    return (
      <BottomSheet title="Rename session" onClose={onClose}>
        <label
          htmlFor="rename-service"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Session title
        </label>
        <input
          id="rename-service"
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          autoFocus
        />
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={saveRename}
            className={`flex-1 ${PRIMARY_BUTTON}`}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 ${SECONDARY_BUTTON}`}
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet title="Change duration" onClose={onClose}>
      <Dropdown
        name="service-duration"
        label="Duration (minutes)"
        options={SERVICE_DURATION_OPTIONS}
        value={durationValue}
        setValue={setDurationValue}
      />
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={saveDuration}
          className={`flex-1 ${PRIMARY_BUTTON}`}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`flex-1 ${SECONDARY_BUTTON}`}
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  )
}
