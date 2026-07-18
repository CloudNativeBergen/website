'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { ScheduleAction } from '@/lib/schedule/reducer'
import {
  SCHEDULE_END,
  calculateEndTime,
  durationBetween,
  getProposalDurationMinutes,
  toMinutes,
  withinScheduleEnd,
} from '@/lib/schedule/time'
import { SERVICE_DURATION_OPTIONS } from '@/lib/schedule/constants'
import { fitsInTrack, isTrackIntervalFree } from '@/lib/schedule/rules'
import { scheduledProposalIdsExcludingDay } from '@/lib/schedule/operations'
import { formatConferenceDate } from '@/lib/time'
import { buildTrackRail, type RailSegment } from './mobileRail'
import { StatusBadge, LevelIndicator } from '@/lib/proposal'
import { Status } from '@/lib/proposal/types'
import { populatedSpeakerNames } from '@/lib/speaker/formatSpeakerNames'
import { Dropdown } from '@/components/Form'
import { useProposalFilters } from './useProposalFilters'
import { ProposalFilters } from './ProposalFilters'
import {
  PlusIcon,
  BookmarkIcon,
  CheckCircleIcon,
  XMarkIcon,
  ClockIcon,
  UserIcon,
  InformationCircleIcon,
  ArrowsRightLeftIcon,
  TrashIcon,
  PencilIcon,
  ArrowsUpDownIcon,
  InboxStackIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'

import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TAP_TARGET,
  GUTTER_PX,
  MIN_OPEN_SLOT_MIN,
  segmentHeight,
  segmentLabel,
  segmentState,
} from './mobile'
import type {
  ActiveSheet,
  MobileScheduleViewProps,
  Placing,
  SegmentState,
  SlotContext,
} from './mobile'

/* -------------------------------------------------------------------------- */
/* Bottom sheet                                                               */
/* -------------------------------------------------------------------------- */

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const titleId = useMemo(
    () => `sheet-${title.replace(/\s+/g, '-').toLowerCase()}`,
    [title],
  )
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape to close, plus a focus trap and body-scroll lock so this
  // `aria-modal` sheet actually behaves modally: keyboard/screen-reader users
  // can't Tab into the covered background, and the page behind doesn't scroll.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const focusables = (): HTMLElement[] =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    // Move focus into the sheet on open.
    ;(focusables()[0] ?? dialogRef.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !dialogRef.current?.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        // Wrap backwards to the last element (or pull stray focus back in).
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        // Wrap forwards to the first element; also pull focus back in if it
        // somehow escaped the dialog, so Tab can't advance into the background.
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-xl focus:outline-none dark:bg-gray-900"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2
            id={titleId}
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sheet"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Service edit sheet (rename / duration)                                     */
/* -------------------------------------------------------------------------- */

function ServiceEditSheet({
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

/* -------------------------------------------------------------------------- */
/* Unassigned drawer                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The unified "add to schedule" drawer, in two modes:
 *  - `context` set   → tapped an OPEN slot. The user can EITHER assign a fitting
 *    unassigned talk (tap drops it straight in) OR create a service session in
 *    place (the start time is fixed to the tapped slot). This merges what used
 *    to be two separate actions (assign talk vs. the per-track "+ Service").
 *  - `context` null  → the header's Unassigned list: tapping a proposal picks
 *    it up (`onPick`) so the user can then tap a slot. No service creation here
 *    because there is no target slot yet.
 */
function UnassignedDrawer({
  proposals,
  context,
  track,
  dispatch,
  onPick,
  onClose,
}: {
  proposals: ProposalExisting[]
  context: SlotContext | null
  track: ScheduleTrack | null
  dispatch: React.Dispatch<ScheduleAction>
  onPick: (proposal: ProposalExisting) => void
  onClose: () => void
}) {
  const source = useMemo(() => {
    if (!context || !track) return proposals
    return proposals.filter((p) => {
      const dur = getProposalDurationMinutes(p)
      if (dur > context.maxDurationMin) return false
      if (!withinScheduleEnd(calculateEndTime(context.startTime, dur)))
        return false
      return fitsInTrack(track, context.startTime, dur)
    })
  }, [proposals, context, track])

  const filters = useProposalFilters(source)

  // Inline service-creation sub-view (only reachable when a slot was tapped).
  const [creatingService, setCreatingService] = useState(false)
  const [serviceTitle, setServiceTitle] = useState('')
  const [serviceDuration, setServiceDuration] = useState('10')
  const [serviceError, setServiceError] = useState<string | null>(null)

  // Offer only durations that fit inside the tapped slot's free length, so a
  // service can never be created longer than the gap the user tapped into. If
  // no standard option fits (a sub-5-min gap), fall back to the exact available
  // minutes rather than a value that would fail the submit guard — otherwise the
  // form is a dead end (title accepted, "Add session" always errors).
  const durationOptions = useMemo(() => {
    if (!context) return SERVICE_DURATION_OPTIONS
    const fitting = [...SERVICE_DURATION_OPTIONS].filter(
      ([mins]) => Number(mins) <= context.maxDurationMin,
    )
    return new Map(
      fitting.length > 0
        ? fitting
        : [
            [
              String(context.maxDurationMin),
              `${context.maxDurationMin} minutes`,
            ],
          ],
    )
  }, [context])
  const effectiveDuration = durationOptions.has(serviceDuration)
    ? serviceDuration
    : (durationOptions.keys().next().value ?? '5')

  const confirmService = useCallback(() => {
    if (!context) return
    const trimmed = serviceTitle.trim()
    if (!trimmed) {
      setServiceError('Enter a session title.')
      return
    }
    const dur = Number(effectiveDuration)
    const endTime = calculateEndTime(context.startTime, dur)
    if (
      dur > context.maxDurationMin ||
      toMinutes(endTime) > toMinutes(SCHEDULE_END)
    ) {
      setServiceError('That duration runs past the free slot.')
      return
    }
    // `maxDurationMin` was snapshotted when the slot was tapped; re-check against
    // the LIVE track so a schedule change while the sheet is open (another
    // edit / undo) can't drop a service into a now-occupied interval. The
    // reducer would reject it too, but this keeps the UI honest.
    if (track && !isTrackIntervalFree(track, context.startTime, endTime)) {
      setServiceError('That slot was just taken — pick another.')
      return
    }
    dispatch({
      type: 'addService',
      trackIndex: context.trackIndex,
      title: trimmed,
      startTime: context.startTime,
      duration: dur,
    })
    onClose()
  }, [context, track, serviceTitle, effectiveDuration, dispatch, onClose])

  const handlePick = useCallback(
    (proposal: ProposalExisting) => {
      if (context) {
        dispatch({
          type: 'moveProposal',
          dragItem: { type: 'proposal', proposal },
          dropPosition: {
            trackIndex: context.trackIndex,
            timeSlot: context.startTime,
          },
        })
        onClose()
        return
      }
      onPick(proposal)
    },
    [context, dispatch, onPick, onClose],
  )

  // Service-creation sub-view: title + duration, start time fixed to the slot.
  if (context && creatingService) {
    return (
      <BottomSheet
        title={`New service at ${context.startTime}`}
        onClose={onClose}
      >
        <button
          type="button"
          onClick={() => {
            setCreatingService(false)
            setServiceError(null)
          }}
          className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-300"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to talks
        </button>

        <label
          htmlFor="slot-service-title"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Session title
        </label>
        <input
          id="slot-service-title"
          type="text"
          value={serviceTitle}
          onChange={(e) => setServiceTitle(e.target.value)}
          placeholder="e.g. Coffee Break, Lunch"
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
          autoFocus
        />

        <div className="mb-4">
          <Dropdown
            name="slot-service-duration"
            label="Duration (minutes)"
            options={durationOptions}
            value={effectiveDuration}
            setValue={setServiceDuration}
          />
        </div>

        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Starts at {context.startTime} · up to {context.maxDurationMin} min
          available
        </p>

        {serviceError && (
          <p
            role="alert"
            className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            {serviceError}
          </p>
        )}

        <button
          type="button"
          onClick={confirmService}
          disabled={!serviceTitle.trim()}
          className={`w-full ${PRIMARY_BUTTON}`}
        >
          Add session
        </button>
      </BottomSheet>
    )
  }

  const title = context
    ? `Assign at ${context.startTime}`
    : `Unassigned (${proposals.length})`

  return (
    <BottomSheet title={title} onClose={onClose}>
      {context && (
        <>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Free until{' '}
            {calculateEndTime(context.startTime, context.maxDurationMin)} ·{' '}
            {context.maxDurationMin} min available
          </p>
          {/* The merged "create a service session" path — same tap-a-slot entry
              point as assigning a talk, no separate per-track button. */}
          <button
            type="button"
            onClick={() => {
              setCreatingService(true)
              setServiceError(null)
            }}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            <PlusIcon className="h-4 w-4" />
            Create service session here
          </button>
        </>
      )}
      <div className="relative mb-4">
        <ProposalFilters filters={filters} />
      </div>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {filters.statsText}
      </p>
      {filters.filteredProposals.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {source.length === 0
            ? context
              ? 'No unassigned talk fits this open slot.'
              : 'Every talk has been scheduled.'
            : 'No talks match your filters.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filters.filteredProposals.map((proposal) => {
            const speakers = populatedSpeakerNames(proposal)
            return (
              <li key={proposal._id}>
                <button
                  type="button"
                  onClick={() => handlePick(proposal)}
                  className={`flex w-full ${TAP_TARGET} flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {proposal.title}
                    </span>
                    <LevelIndicator
                      level={proposal.level}
                      size="xs"
                      className="mt-0.5 shrink-0"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={proposal.status} variant="compact" />
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {`${getProposalDurationMinutes(proposal)}m`}
                    </span>
                    {speakers && (
                      <span className="inline-flex items-center gap-1 truncate text-xs text-gray-600 dark:text-gray-400">
                        <UserIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{speakers}</span>
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </BottomSheet>
  )
}

/* -------------------------------------------------------------------------- */
/* Legend disclosure                                                          */
/* -------------------------------------------------------------------------- */

function dayLabel(schedule: ConferenceSchedule, index: number): string {
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
function DaySelect({
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

function LegendDisclosure() {
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

/* -------------------------------------------------------------------------- */
/* Rail segment body                                                          */
/* -------------------------------------------------------------------------- */

function DurationChip({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 tabular-nums dark:bg-gray-700 dark:text-gray-300">
      <ClockIcon className="h-3 w-3" />
      {`${minutes}m`}
    </span>
  )
}

/**
 * One track's hybrid time-rail: a continuous gutter line with a node per
 * segment, and duration-proportional (clamped) bodies. When `placing` is set the
 * rail is a target picker — only valid segments are enabled and highlighted.
 */
function TrackRail({
  track,
  trackIndex,
  tracks,
  placing,
  otherScheduledProposalIds,
  onSegmentTap,
  onTrackOptions,
}: {
  track: ScheduleTrack
  trackIndex: number
  tracks: ScheduleTrack[]
  placing: Placing | null
  otherScheduledProposalIds: ReadonlySet<string>
  onSegmentTap: (trackIndex: number, seg: RailSegment) => void
  onTrackOptions: (trackIndex: number) => void
}) {
  const segments = useMemo(() => buildTrackRail(track), [track])

  return (
    <div className="pb-8">
      {/* Hidden while placing: the rail is a target picker, so the per-track
          controls would only get in the way. Adding a service now lives in the
          slot-tap sheet (tap an open slot → "Create service session here"). */}
      {!placing && (
        <div className="mb-1 flex items-center">
          <button
            type="button"
            onClick={() => onTrackOptions(trackIndex)}
            aria-label="Track options"
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Cog6ToothIcon className="h-4 w-4" />
            Track
          </button>
        </div>
      )}

      <div className="relative" style={{ paddingLeft: GUTTER_PX }}>
        {/* One continuous rail line behind all the rows. */}
        <div
          className="absolute top-3 bottom-3 w-px bg-gray-200 dark:bg-gray-700"
          style={{ left: GUTTER_PX }}
          aria-hidden="true"
        />
        <ul>
          {segments.map((seg, i) => {
            const height = segmentHeight(seg)
            const state: SegmentState = placing
              ? segmentState(
                  placing,
                  tracks,
                  trackIndex,
                  seg,
                  otherScheduledProposalIds,
                )
              : 'default'

            // Slim, non-interactive divider for gaps too small to hold a talk.
            if (seg.kind === 'open' && seg.durationMin < MIN_OPEN_SLOT_MIN) {
              return (
                <li key={i} className="relative flex" style={{ minHeight: 28 }}>
                  <span
                    className="absolute top-0 w-[46px] text-right text-xs text-gray-400 tabular-nums dark:text-gray-500"
                    style={{ left: -GUTTER_PX }}
                  >
                    {seg.startTime}
                  </span>
                  <span
                    className="absolute top-2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gray-200 dark:bg-gray-700"
                    style={{ left: 0 }}
                    aria-hidden="true"
                  />
                  <div className="flex-1 pl-4">
                    <div className="mt-1 text-[11px] text-gray-400 tabular-nums dark:text-gray-500">
                      {`${seg.durationMin} min`}
                    </div>
                  </div>
                </li>
              )
            }

            // When not placing, every talk/break/open (>=10) is tappable. When
            // placing, only valid targets and the source stay interactive.
            const disabled = state === 'invalid'

            return (
              <li key={i} className="relative flex">
                <span
                  className="absolute top-0 w-[46px] text-right text-xs text-gray-500 tabular-nums dark:text-gray-400"
                  style={{ left: -GUTTER_PX }}
                >
                  {seg.startTime}
                </span>
                <span
                  className={clsx(
                    'absolute top-1.5 h-2 w-2 -translate-x-1/2 rounded-full',
                    state === 'valid'
                      ? 'bg-blue-500'
                      : state === 'source'
                        ? 'bg-blue-600'
                        : 'bg-gray-300 dark:bg-gray-600',
                  )}
                  style={{ left: 0 }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 pb-2 pl-4">
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={segmentLabel(seg, placing, state)}
                    onClick={() => onSegmentTap(trackIndex, seg)}
                    style={{ minHeight: height }}
                    className={clsx(
                      'flex w-full flex-col justify-center gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                      state === 'source' &&
                        'border-blue-500 bg-blue-50 ring-2 ring-blue-500 dark:border-blue-500 dark:bg-blue-900/30',
                      state === 'valid' &&
                        'border-blue-400 bg-blue-50 ring-2 ring-blue-400 dark:border-blue-500 dark:bg-blue-900/20',
                      state === 'invalid' && 'opacity-40',
                      state === 'default' &&
                        seg.kind === 'talk' &&
                        'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700',
                      state === 'default' &&
                        seg.kind === 'break' &&
                        'border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/60',
                      state === 'default' &&
                        seg.kind === 'open' &&
                        'border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10 dark:hover:bg-blue-900/20',
                    )}
                  >
                    <RailBody seg={seg} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function RailBody({ seg }: { seg: RailSegment }) {
  if (seg.kind === 'open') {
    return (
      <span className="flex items-center text-sm font-medium text-blue-700 dark:text-blue-300">
        <PlusIcon className="mr-1.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate tabular-nums">
          Assign · {seg.startTime}–{seg.endTime} · {seg.durationMin} min
        </span>
      </span>
    )
  }

  const proposal = seg.talk.talk
  const title = proposal?.title ?? seg.talk.placeholder ?? 'Untitled'

  if (seg.kind === 'break') {
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <h3 className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-gray-600 dark:text-gray-300">
            <ClockIcon className="h-4 w-4 shrink-0" />
            {title}
          </h3>
          <DurationChip minutes={seg.durationMin} />
        </div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Service session
        </span>
      </>
    )
  }

  const speakers = proposal ? populatedSpeakerNames(proposal) : null
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <DurationChip minutes={seg.durationMin} />
          {proposal && (
            <LevelIndicator
              level={proposal.level}
              size="xs"
              className="mt-0.5"
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {proposal && <StatusBadge status={proposal.status} variant="compact" />}
        {speakers && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <UserIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{speakers}</span>
          </span>
        )}
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Placing banner                                                             */
/* -------------------------------------------------------------------------- */

function PlacingBanner({
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

/* -------------------------------------------------------------------------- */
/* Card action sheet (tap a scheduled talk/service)                           */
/* -------------------------------------------------------------------------- */

function CardActionSheet({
  talk,
  onMove,
  onRename,
  onDuration,
  onDuplicate,
  onRemove,
  onClose,
}: {
  talk: TrackTalk
  onMove: () => void
  onRename: () => void
  onDuration: () => void
  onDuplicate: () => void
  onRemove: () => void
  onClose: () => void
}) {
  // A real service session has a placeholder; a talk-less slot without one
  // (defensive) must not surface the service-only actions.
  const isService = !talk.talk && !!talk.placeholder
  const title = talk.talk?.title ?? talk.placeholder ?? 'Untitled'
  const action =
    'inline-flex min-h-[44px] w-full items-center justify-start gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

  return (
    <BottomSheet title={title} onClose={onClose}>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        {talk.startTime}–{talk.endTime}
        {isService ? ' · Service session' : ''}
      </p>
      <div className="space-y-2">
        <button type="button" onClick={onMove} className={action}>
          <ArrowsRightLeftIcon className="h-5 w-5" />
          {isService ? 'Move to another slot' : 'Move or swap'}
        </button>
        {isService && (
          <>
            <button type="button" onClick={onRename} className={action}>
              <PencilIcon className="h-5 w-5" />
              Rename
            </button>
            <button type="button" onClick={onDuration} className={action}>
              <ArrowsUpDownIcon className="h-5 w-5" />
              Change duration
            </button>
            <button type="button" onClick={onDuplicate} className={action}>
              <DocumentDuplicateIcon className="h-5 w-5" />
              Duplicate to all tracks
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-[44px] w-full items-center justify-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
        >
          <TrashIcon className="h-5 w-5" />
          Remove from schedule
        </button>
      </div>
    </BottomSheet>
  )
}

/* -------------------------------------------------------------------------- */
/* Track action sheet (rename / remove a track)                               */
/* -------------------------------------------------------------------------- */

function TrackActionSheet({
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

/* -------------------------------------------------------------------------- */
/* Main view                                                                  */
/* -------------------------------------------------------------------------- */

export function MobileScheduleView({
  schedules,
  currentDayIndex,
  unassignedProposals,
  dispatch,
  onDayChange,
  onSave,
  onAddTrack,
  isSaving,
  saveSuccess,
  error,
}: MobileScheduleViewProps) {
  const schedule = schedules[currentDayIndex] ?? null
  const tracks = useMemo(() => schedule?.tracks ?? [], [schedule])

  // Proposals scheduled on OTHER days — the cross-day duplicate set. Passed into
  // `segmentState` so the rail's valid-target highlighting applies the SAME
  // guard the reducer's `moveProposal` does and can't offer a rejected drop.
  const otherScheduledProposalIds = useMemo(
    () => scheduledProposalIdsExcludingDay(schedules, currentDayIndex),
    [schedules, currentDayIndex],
  )

  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0)
  const [placing, setPlacing] = useState<Placing | null>(null)
  const [sheet, setSheet] = useState<ActiveSheet>(null)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rafRef = useRef<number | null>(null)

  // Keep the selected track valid when the day (and therefore the track list)
  // changes underneath us.
  const safeTrackIndex =
    tracks.length === 0 ? 0 : Math.min(selectedTrackIndex, tracks.length - 1)
  const prevTrackCount = useRef(tracks.length)
  useEffect(() => {
    if (prevTrackCount.current !== tracks.length) {
      prevTrackCount.current = tracks.length
      setSelectedTrackIndex((i) => Math.min(i, Math.max(0, tracks.length - 1)))
    }
  }, [tracks.length])

  const closeSheet = useCallback(() => setSheet(null), [])

  // Live view of the picked-up scheduled item: derived from current `tracks` so
  // a rename/resize while placing is reflected, and the ORIGINAL talkIndex keeps
  // reducer actions correct. Falls back to the snapshot if the index drifts.
  const effPlacing = useMemo<Placing | null>(() => {
    if (!placing || placing.kind !== 'scheduled') return placing
    const live = tracks[placing.trackIndex]?.talks[placing.talkIndex]
    return live ? { ...placing, talk: live } : placing
  }, [placing, tracks])

  const goToTrack = useCallback((index: number) => {
    setSelectedTrackIndex(index)
    panelRefs.current[index]?.scrollIntoView?.({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [])

  // On day change, reset per-day UI (first track, no pending pick-up) and jump
  // the carousel back to the first track. Guarded by a ref so the state resets
  // are conditional (matching the track-count effect above) rather than a
  // top-level setState-in-effect.
  const prevDayRef = useRef(currentDayIndex)
  useEffect(() => {
    if (prevDayRef.current !== currentDayIndex) {
      prevDayRef.current = currentDayIndex
      setSelectedTrackIndex(0)
      setPlacing(null)
      // Also close any open sheet — if the day changed via parent state (not
      // handleDayChange) a sheet could otherwise linger with stale context.
      setSheet(null)
    }
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollLeft = 0
  }, [currentDayIndex])

  // Live-update the active tab as the user swipes: pick the panel whose
  // horizontal centre is nearest the scroller's centre. Never scrolls
  // programmatically, so it doesn't fight the drag. Throttled with rAF.
  const handleScroll = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const scroller = scrollerRef.current
      if (!scroller) return
      const rect = scroller.getBoundingClientRect()
      const centre = rect.left + rect.width / 2
      let nearest = 0
      let best = Infinity
      panelRefs.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const c = r.left + r.width / 2
        const d = Math.abs(c - centre)
        if (d < best) {
          best = d
          nearest = i
        }
      })
      setSelectedTrackIndex((prev) => (prev === nearest ? prev : nearest))
    })
  }, [])

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const handleDayChange = useCallback(
    (dayIndex: number) => {
      onDayChange(dayIndex)
      setSelectedTrackIndex(0)
      setPlacing(null)
      setSheet(null)
    },
    [onDayChange],
  )

  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const next = Math.min(Math.max(index + delta, 0), tracks.length - 1)
      goToTrack(next)
      tabRefs.current[next]?.focus()
    },
    [goToTrack, tracks.length],
  )

  // Central tap router: pick up when idle, drop/swap/cancel when placing.
  const handleSegmentTap = useCallback(
    (panelTrackIndex: number, seg: RailSegment) => {
      const active = effPlacing
      if (!active) {
        if (seg.kind === 'open') {
          setSheet({
            kind: 'unassigned',
            context: {
              trackIndex: panelTrackIndex,
              startTime: seg.startTime,
              maxDurationMin: seg.durationMin,
            },
          })
        } else {
          // Tap a talk/break → a self-describing action sheet (Move/Swap for
          // talks, Rename/Duration for services, Remove). Surfaces edit/remove
          // that were previously hidden behind the placing banner.
          setSheet({
            kind: 'card',
            trackIndex: panelTrackIndex,
            talkIndex: seg.talkIndex,
            talk: seg.talk,
          })
        }
        return
      }

      const state = segmentState(
        active,
        tracks,
        panelTrackIndex,
        seg,
        otherScheduledProposalIds,
      )
      if (state === 'source') {
        setPlacing(null)
        return
      }
      if (state !== 'valid') return

      if (seg.kind === 'open') {
        if (active.kind === 'proposal') {
          dispatch({
            type: 'moveProposal',
            dragItem: { type: 'proposal', proposal: active.proposal },
            dropPosition: {
              trackIndex: panelTrackIndex,
              timeSlot: seg.startTime,
            },
          })
        } else if (active.talk.talk) {
          dispatch({
            type: 'moveProposal',
            dragItem: {
              type: 'scheduled-talk',
              proposal: active.talk.talk,
              sourceTrackIndex: active.trackIndex,
              sourceTimeSlot: active.talk.startTime,
            },
            dropPosition: {
              trackIndex: panelTrackIndex,
              timeSlot: seg.startTime,
            },
          })
        } else {
          dispatch({
            type: 'moveService',
            dragItem: {
              type: 'scheduled-service',
              serviceSession: {
                placeholder: active.talk.placeholder ?? '',
                startTime: active.talk.startTime,
                endTime: active.talk.endTime,
              },
              sourceTrackIndex: active.trackIndex,
              sourceTimeSlot: active.talk.startTime,
            },
            dropPosition: {
              trackIndex: panelTrackIndex,
              timeSlot: seg.startTime,
            },
          })
        }
      } else if (seg.kind === 'talk' && active.kind === 'scheduled') {
        // Swap the picked-up talk with the occupied target slot.
        dispatch({
          type: 'moveProposal',
          dragItem: {
            type: 'scheduled-talk',
            proposal: active.talk.talk,
            sourceTrackIndex: active.trackIndex,
            sourceTimeSlot: active.talk.startTime,
          },
          dropPosition: {
            trackIndex: panelTrackIndex,
            timeSlot: seg.startTime,
          },
        })
      }
      setPlacing(null)
    },
    [effPlacing, tracks, dispatch, otherScheduledProposalIds],
  )

  const openTrackOptions = useCallback((trackIndex: number) => {
    setSheet({ kind: 'track', trackIndex })
  }, [])

  // Whether the CURRENT panel offers any legal drop for the pick-up (drives the
  // "no room here" hint).
  const hasValidTargetHere = useMemo(() => {
    if (!effPlacing) return true
    const track = tracks[safeTrackIndex]
    if (!track) return false
    return buildTrackRail(track).some(
      (seg) =>
        segmentState(
          effPlacing,
          tracks,
          safeTrackIndex,
          seg,
          otherScheduledProposalIds,
        ) === 'valid',
    )
  }, [effPlacing, tracks, safeTrackIndex, otherScheduledProposalIds])

  const tabId = (i: number) => `sched-tab-${i}`
  const panelId = (i: number) => `sched-panel-${i}`

  const trackSheetTrack =
    sheet?.kind === 'track' ? (tracks[sheet.trackIndex] ?? null) : null
  const drawerTrack =
    sheet?.kind === 'unassigned' && sheet.context
      ? (tracks[sheet.context.trackIndex] ?? null)
      : null

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 pt-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-2">
          <DaySelect
            schedules={schedules}
            currentDayIndex={currentDayIndex}
            onSelect={handleDayChange}
          />
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSheet({ kind: 'unassigned', context: null })}
              aria-label={`Unassigned (${unassignedProposals.length})`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <InboxStackIcon className="h-5 w-5" />
              <span className="tabular-nums">{unassignedProposals.length}</span>
            </button>
            <LegendDisclosure />
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 ${
                saveSuccess
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
              }`}
            >
              {saveSuccess ? (
                <>
                  <CheckCircleIcon className="h-5 w-5" />
                  Saved
                </>
              ) : (
                <>
                  <BookmarkIcon className="h-5 w-5" />
                  {isSaving ? 'Saving…' : 'Save'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Fixed track tab strip (synced to the carousel below). */}
        {tracks.length > 0 ? (
          <div className="mt-2 flex items-stretch gap-2 pb-2.5">
            <div
              role="tablist"
              aria-label="Select track"
              className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
            >
              {tracks.map((track, index) => {
                const isActive = index === safeTrackIndex
                return (
                  <button
                    key={index}
                    ref={(el) => {
                      tabRefs.current[index] = el
                    }}
                    type="button"
                    role="tab"
                    id={tabId(index)}
                    aria-selected={isActive}
                    aria-controls={panelId(index)}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => goToTrack(index)}
                    onKeyDown={(e) => onTabKeyDown(e, index)}
                    className={clsx(
                      'min-h-[44px] min-w-0 flex-1 truncate rounded-full border px-3 text-center text-sm font-medium transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                      isActive
                        ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                    )}
                  >
                    {track.trackTitle || `Track ${index + 1}`}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={onAddTrack}
              aria-label="Add track"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 bg-white px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <PlusIcon className="h-4 w-4" />
              Track
            </button>
          </div>
        ) : (
          <div className="pb-3" />
        )}
      </header>

      {error && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Placing banner */}
      {effPlacing && (
        <PlacingBanner
          placing={effPlacing}
          hasValidTarget={hasValidTargetHere}
          onCancel={() => setPlacing(null)}
        />
      )}

      {/* Carousel */}
      {tracks.length === 0 ? (
        <main className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No tracks created yet.
            </p>
            <button
              type="button"
              onClick={onAddTrack}
              className={PRIMARY_BUTTON}
            >
              <PlusIcon className="h-5 w-5" />
              Create first track
            </button>
          </div>
        </main>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex flex-1 snap-x snap-mandatory gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {tracks.map((track, trackIndex) => (
            <div
              key={trackIndex}
              ref={(el) => {
                panelRefs.current[trackIndex] = el
              }}
              role="tabpanel"
              id={panelId(trackIndex)}
              aria-labelledby={tabId(trackIndex)}
              // Full-width panels (no side peek) so each track's cards use the
              // whole screen width. `snap-always` (scroll-snap-stop) forces
              // exactly one track per fling so a fast swipe can't skip a track.
              className="shrink-0 basis-[100vw] snap-center snap-always overflow-y-auto px-3 pt-2"
            >
              <TrackRail
                track={track}
                trackIndex={trackIndex}
                tracks={tracks}
                placing={effPlacing}
                otherScheduledProposalIds={otherScheduledProposalIds}
                onSegmentTap={handleSegmentTap}
                onTrackOptions={openTrackOptions}
              />
            </div>
          ))}
        </div>
      )}

      {/* Sheets */}
      {sheet?.kind === 'unassigned' && (
        <UnassignedDrawer
          proposals={unassignedProposals}
          context={sheet.context}
          track={drawerTrack}
          dispatch={dispatch}
          onPick={(proposal) => {
            setPlacing({ kind: 'proposal', proposal })
            closeSheet()
          }}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === 'card' && (
        <CardActionSheet
          talk={sheet.talk}
          onMove={() => {
            setPlacing({
              kind: 'scheduled',
              trackIndex: sheet.trackIndex,
              talkIndex: sheet.talkIndex,
              talk: sheet.talk,
            })
            closeSheet()
          }}
          onRename={() =>
            setSheet({ ...sheet, kind: 'serviceEdit', mode: 'rename' })
          }
          onDuration={() =>
            setSheet({ ...sheet, kind: 'serviceEdit', mode: 'duration' })
          }
          onDuplicate={() => {
            dispatch({
              type: 'duplicateService',
              serviceSession: sheet.talk,
              sourceTrackIndex: sheet.trackIndex,
            })
            closeSheet()
          }}
          onRemove={() => {
            dispatch({
              type: 'removeTalk',
              trackIndex: sheet.trackIndex,
              talkIndex: sheet.talkIndex,
            })
            closeSheet()
          }}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === 'track' && trackSheetTrack && (
        <TrackActionSheet
          track={trackSheetTrack}
          trackIndex={sheet.trackIndex}
          dispatch={dispatch}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === 'serviceEdit' && (
        <ServiceEditSheet
          talk={sheet.talk}
          trackIndex={sheet.trackIndex}
          talkIndex={sheet.talkIndex}
          mode={sheet.mode}
          dispatch={dispatch}
          onClose={closeSheet}
        />
      )}
    </div>
  )
}
