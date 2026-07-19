'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { ScheduleTrack } from '@/lib/conference/types'
import { Dropdown } from '@/components/Form'
import { SERVICE_DURATION_OPTIONS } from '@/lib/schedule/constants'
import {
  SCHEDULE_END,
  calculateEndTime,
  endsWithinScheduleDay,
  toMinutes,
} from '@/lib/schedule/time'
import { isTrackIntervalFree } from '@/lib/schedule/rules'
import { useModalA11y } from '../useModalA11y'

interface ServiceSessionModalProps {
  isOpen: boolean
  timeSlot: string
  track: ScheduleTrack
  onClose: () => void
  onSave: (title: string, duration: number) => void
}

export const ServiceSessionModal = ({
  isOpen,
  timeSlot,
  track,
  onClose,
  onSave,
}: ServiceSessionModalProps) => {
  // The dialog is an inner component so its hooks (modal a11y, per-open state)
  // only run while the modal is actually open.
  if (!isOpen) return null
  return (
    <ServiceSessionDialog
      timeSlot={timeSlot}
      track={track}
      onClose={onClose}
      onSave={onSave}
    />
  )
}

const ServiceSessionDialog = ({
  timeSlot,
  track,
  onClose,
  onSave,
}: Omit<ServiceSessionModalProps, 'isOpen'>) => {
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState('10')
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Modal semantics: Escape closes, focus moves in (preferring the autoFocus
  // title input) and is restored on close, Tab is trapped. Shared with
  // AddTrackModal and the mobile BottomSheet.
  useModalA11y(dialogRef, onClose)

  // Free minutes from the chosen start until the next talk/session (or the end
  // of the day). Recomputed from the LIVE track so a schedule change while the
  // modal is open can't offer a duration the reducer would reject.
  const maxDurationMin = useMemo(() => {
    const start = toMinutes(timeSlot)
    let limit = toMinutes(SCHEDULE_END)
    for (const t of track.talks) {
      const s = toMinutes(t.startTime)
      const e = toMinutes(t.endTime)
      // The start itself sits inside an existing item — nothing fits.
      if (s <= start && e > start) return 0
      if (s > start) limit = Math.min(limit, s)
    }
    return limit - start
  }, [track, timeSlot])

  // Offer only durations that fit the free gap (mirrors the mobile
  // UnassignedDrawer). If no standard option fits but SOME time is free, fall
  // back to the exact available minutes so the form isn't a dead end.
  const durationOptions = useMemo(() => {
    const fitting = [...SERVICE_DURATION_OPTIONS].filter(
      ([mins]) => Number(mins) <= maxDurationMin,
    )
    if (fitting.length > 0) return new Map(fitting)
    if (maxDurationMin > 0) {
      return new Map([[String(maxDurationMin), `${maxDurationMin} minutes`]])
    }
    return new Map<string, string>()
  }, [maxDurationMin])

  const effectiveDuration = durationOptions.has(duration)
    ? duration
    : (durationOptions.keys().next().value ?? '')

  const nothingFits = durationOptions.size === 0

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = title.trim()
      if (!trimmed) return
      const dur = Number(effectiveDuration)
      // Re-validate against the live track with the reducer's own rules
      // (end-of-day + interval free) so a rejected add can't silently close
      // the modal — surface an inline error instead.
      if (!dur || !endsWithinScheduleDay(timeSlot, dur)) {
        setError('That duration runs past the free slot.')
        return
      }
      const endTime = calculateEndTime(timeSlot, dur)
      if (!isTrackIntervalFree(track, timeSlot, endTime)) {
        setError('That slot was just taken — pick another.')
        return
      }
      onSave(trimmed, dur)
    },
    [title, effectiveDuration, timeSlot, track, onSave],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-session-modal-title"
        className="mx-4 w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800"
      >
        <h3
          id="service-session-modal-title"
          className="mb-4 text-lg font-semibold text-gray-900 dark:text-white"
        >
          Create Service Session
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Starting at {timeSlot}
          {maxDurationMin > 0 && ` · up to ${maxDurationMin} min available`}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Session Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              placeholder="e.g., Coffee Break, Lunch, Networking"
              required
              autoFocus
            />
          </div>

          <div>
            <Dropdown
              name="duration"
              label="Duration (minutes)"
              options={durationOptions}
              value={effectiveDuration}
              setValue={(val) => {
                setDuration(val)
                setError(null)
              }}
              disabled={nothingFits}
            />
          </div>

          {(error || nothingFits) && (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
            >
              {nothingFits
                ? 'This slot is no longer free — close and pick another.'
                : error}
            </p>
          )}

          {/* Cancel LEFT, primary RIGHT — mirrors the SendMessageModal footer
              (the house order); a primary-on-the-left footer read as a bug. */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-500 focus:outline-none dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={nothingFits}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              Create Session
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
