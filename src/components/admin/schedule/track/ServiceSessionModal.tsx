'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ClockIcon } from '@heroicons/react/24/outline'
import { ScheduleTrack } from '@/lib/conference/types'
import { Dropdown } from '@/components/Form'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { SERVICE_DURATION_OPTIONS } from '@/lib/schedule/constants'
import {
  SCHEDULE_END,
  calculateEndTime,
  endsWithinScheduleDay,
  toMinutes,
} from '@/lib/schedule/time'
import { isTrackIntervalFree } from '@/lib/schedule/rules'

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
  // The dialog is an inner component so its per-open state (title, duration,
  // error) resets between opens. ModalShell's `appear` transition still
  // animates the entry on mount.
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
  const DEFAULT_DURATION = '10'
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [error, setError] = useState<string | null>(null)

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
    // ModalShell provides the house dialog semantics this modal used to
    // hand-roll via useModalA11y: focus trap + restore, Escape close, scroll
    // lock, labelled 44px header close, backdrop click-to-close, and a bottom
    // sheet below `sm`. HeadlessUI's Dialog portals to document.body — outside
    // the schedule editor's DndContext DOM, which is fine: React context flows
    // through portals and the modal only opens from a click, never mid-drag.
    <ModalShell
      isOpen
      onClose={onClose}
      size="md"
      title="Create Service Session"
      subtitle={
        <>
          Starting at {timeSlot}
          {maxDurationMin > 0 && ` · up to ${maxDurationMin} min available`}
        </>
      }
      icon={<ClockIcon className="h-5 w-5" />}
      confirmOnDirtyClose
      // A changed duration is ALSO unsaved intent — without it, Escape/backdrop
      // after picking a duration (but before typing a title) discards silently.
      isDirty={title.trim().length > 0 || duration !== DEFAULT_DURATION}
    >
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
            // HeadlessUI's focus trap sends initial focus to the first
            // focusable (the header Close button) unless an element opts in
            // with data-autofocus — keep the title input as the landing spot.
            data-autofocus
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

        {/* House footer: right-aligned on sm+, stacked with the primary on top
            on mobile (flex-col-reverse). Cancel stays type="button" (the
            AdminButton default) so it never submits the form. */}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <AdminButton
            variant="secondary"
            size="md"
            onClick={onClose}
            className="min-h-[44px]"
          >
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            color="blue"
            size="md"
            disabled={nothingFits}
            className="min-h-[44px]"
          >
            Create Session
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
