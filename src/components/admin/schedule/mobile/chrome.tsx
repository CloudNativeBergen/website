'use client'

import { useState } from 'react'
import { ConferenceSchedule } from '@/lib/conference/types'
import { formatConferenceDate } from '@/lib/time'
import { StatusBadge } from '@/lib/proposal'
import { Status } from '@/lib/proposal/types'
import {
  ClockIcon,
  InformationCircleIcon,
  ArrowsRightLeftIcon,
  XMarkIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'

import type { Placing } from './types'

/* -------------------------------------------------------------------------- */
/* Legend disclosure                                                          */
/* -------------------------------------------------------------------------- */

export function dayLabel(schedule: ConferenceSchedule, index: number): string {
  // Project convention: format YYYY-MM-DD via the shared, timezone-safe helper
  // (no raw `new Date(date)` for display — see AGENTS.md).
  const date = formatConferenceDate(schedule.date, {
    month: 'short',
    day: 'numeric',
  })
  return `Day ${index + 1} · ${date}`
}

/**
 * Day selector (replaces the day-chip row). A single-day schedule renders as
 * static text; multi-day uses a NATIVE styled <select> — this gives full
 * keyboard + screen-reader support and the native mobile picker for free, with
 * none of the focus/keyboard pitfalls of a hand-rolled listbox. Frees a full row
 * of top chrome and scales to any number of days.
 */
export function DaySelect({
  schedules,
  currentDayIndex,
  onSelect,
}: {
  schedules: ConferenceSchedule[]
  currentDayIndex: number
  onSelect: (dayIndex: number) => void
}) {
  const current = schedules[currentDayIndex]

  if (schedules.length <= 1) {
    return (
      <span className="min-w-0 truncate text-base font-semibold text-gray-900 dark:text-white">
        {current ? dayLabel(current, currentDayIndex) : 'Schedule'}
      </span>
    )
  }

  return (
    <div className="relative min-w-0">
      <select
        aria-label="Select day"
        value={currentDayIndex}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="min-h-[44px] max-w-full appearance-none truncate rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-3 text-sm font-semibold text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        {schedules.map((day, index) => (
          <option key={`${index}-${day.date}`} value={index}>
            {dayLabel(day, index)}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
      />
    </div>
  )
}

export function LegendDisclosure() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
        aria-label="Legend"
      >
        <InformationCircleIcon className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
            Legend
          </h3>
          <ul className="space-y-1.5 text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2">
              <StatusBadge status={Status.confirmed} variant="compact" />
              Confirmed talk
            </li>
            <li className="flex items-center gap-2">
              <StatusBadge status={Status.accepted} variant="compact" />
              Accepted, not confirmed
            </li>
            <li className="flex items-center gap-2">
              <span className="rounded border border-dashed border-gray-400 px-1.5 py-0.5 dark:border-gray-500">
                Service
              </span>
              Break / lunch session
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

export function DurationChip({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 tabular-nums dark:bg-gray-700 dark:text-gray-300">
      <ClockIcon className="h-3 w-3" />
      {`${minutes}m`}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Placing banner                                                             */
/* -------------------------------------------------------------------------- */

export function PlacingBanner({
  placing,
  hasValidTarget,
  onCancel,
}: {
  placing: Placing
  hasValidTarget: boolean
  onCancel: () => void
}) {
  const isProposal = placing.kind === 'proposal'
  const isService =
    placing.kind === 'scheduled' &&
    !placing.talk.talk &&
    !!placing.talk.placeholder
  const title = isProposal
    ? placing.proposal.title
    : (placing.talk.talk?.title ?? placing.talk.placeholder ?? 'Untitled')

  // The banner is now purely the "choose where" step — move/swap/remove/edit
  // are chosen up front in the card action sheet. So this only guides the drop.
  const message = isProposal
    ? `Placing “${title}” — tap an open slot`
    : isService
      ? `Moving “${title}” — tap an open slot`
      : `Moving “${title}” — tap a slot to move, or a talk to swap`

  return (
    <div
      role="status"
      className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2 dark:border-blue-800 dark:bg-blue-900/40"
    >
      <div className="flex items-center gap-2">
        <ArrowsRightLeftIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
        <p className="flex-1 text-sm font-medium text-blue-900 dark:text-blue-100">
          {message}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-blue-700 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-blue-900/30"
        >
          <XMarkIcon className="h-4 w-4" />
          Cancel
        </button>
      </div>
      {!hasValidTarget && (
        <p className="mt-1 pl-7 text-xs text-blue-700 dark:text-blue-300">
          No room here — swipe to another track.
        </p>
      )}
    </div>
  )
}
