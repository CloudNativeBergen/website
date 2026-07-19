'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { ScheduleAction } from '@/lib/schedule/reducer'
import {
  calculateEndTime,
  durationBetween,
  withinScheduleEnd,
} from '@/lib/schedule/time'
import { isTrackIntervalFree, matchService } from '@/lib/schedule/rules'
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
  track,
  mode,
  dispatch,
  onClose,
}: {
  talk: TrackTalk
  trackIndex: number
  talkIndex: number
  /** The live track, for filtering durations to what actually fits. */
  track: ScheduleTrack | null
  mode: 'rename' | 'duration'
  dispatch: React.Dispatch<ScheduleAction>
  onClose: () => void
}) {
  const [renameValue, setRenameValue] = useState(talk.placeholder ?? '')
  const [durationValue, setDurationValue] = useState(
    String(durationBetween(talk.startTime, talk.endTime)),
  )
  const [durationError, setDurationError] = useState<string | null>(null)

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

  // Whether `dur` minutes from this session's start stays inside the day and
  // clear of the surrounding items (excluding the session itself) — the exact
  // checks the reducer's `resizeService` applies, so the sheet never offers or
  // submits a duration the reducer would silently reject.
  const durationFits = useCallback(
    (dur: number): boolean => {
      const end = calculateEndTime(talk.startTime, dur)
      if (!withinScheduleEnd(end)) return false
      if (!track) return true
      return isTrackIntervalFree(
        track,
        talk.startTime,
        end,
        matchService(talk.placeholder ?? '', talk.startTime),
      )
    },
    [track, talk.startTime, talk.placeholder],
  )

  // Standard options that fit the surrounding gap, plus the CURRENT duration
  // when it isn't a standard option (the Dropdown needs a valid selection for
  // e.g. a hand-resized 25-min break).
  const currentDuration = durationBetween(talk.startTime, talk.endTime)
  const durationOptions = useMemo(() => {
    const entries = [...SERVICE_DURATION_OPTIONS].filter(([mins]) =>
      durationFits(Number(mins)),
    )
    if (!entries.some(([mins]) => Number(mins) === currentDuration)) {
      entries.push([String(currentDuration), `${currentDuration} minutes`])
      entries.sort((a, b) => Number(a[0]) - Number(b[0]))
    }
    return new Map(entries)
  }, [durationFits, currentDuration])

  const saveDuration = useCallback(() => {
    const dur = Number(durationValue)
    // Re-validate against the LIVE track: the schedule can change while the
    // sheet is open, and a rejected resize must surface here instead of the
    // sheet closing as if it had worked.
    if (!dur || !durationFits(dur)) {
      setDurationError('That duration no longer fits — pick a shorter one.')
      return
    }
    dispatch({
      type: 'resizeService',
      trackIndex,
      talkIndex,
      duration: dur,
    })
    onClose()
  }, [dispatch, trackIndex, talkIndex, durationValue, durationFits, onClose])

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
            disabled={!renameValue.trim()}
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
        options={durationOptions}
        value={durationValue}
        setValue={(val) => {
          setDurationValue(val)
          setDurationError(null)
        }}
      />
      {durationError && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
        >
          {durationError}
        </p>
      )}
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
