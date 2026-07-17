'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import clsx from 'clsx'
import {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { ScheduleAction } from '@/lib/schedule/reducer'
import {
  SCHEDULE_START,
  SCHEDULE_END,
  calculateEndTime,
  durationBetween,
  generateTimeSlots,
  getProposalDurationMinutes,
  toMinutes,
} from '@/lib/schedule/time'
import {
  fitsInTrack,
  isTrackIntervalFree,
  matchTalk,
} from '@/lib/schedule/rules'
import { StatusBadge, LevelIndicator } from '@/lib/proposal'
import { Status } from '@/lib/proposal/types'
import { formatSpeakerNames } from '@/lib/speaker/formatSpeakerNames'
import type { Speaker } from '@/lib/speaker/types'
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
  ArrowLeftIcon,
  ArrowsRightLeftIcon,
  TrashIcon,
  PencilIcon,
  ArrowsUpDownIcon,
  InboxStackIcon,
} from '@heroicons/react/24/outline'

interface MobileScheduleViewProps {
  schedules: ConferenceSchedule[]
  currentDayIndex: number
  unassignedProposals: ProposalExisting[]
  dispatch: React.Dispatch<ScheduleAction>
  onSave: () => void
  onAddTrack: () => void
  isSaving: boolean
  saveSuccess: boolean
  error: string | null
}

const SERVICE_DURATION_OPTIONS = new Map([
  ['5', '5 minutes'],
  ['10', '10 minutes'],
  ['15', '15 minutes'],
  ['20', '20 minutes'],
  ['30', '30 minutes'],
  ['45', '45 minutes'],
  ['60', '60 minutes'],
  ['90', '90 minutes'],
])

const TAP_TARGET = 'min-h-[44px]'

const PRIMARY_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600'

const SECONDARY_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

/** Every `intervalMinutes` start time whose full footprint is free in `track`. */
function freeStartTimes(
  track: ScheduleTrack,
  durationMinutes: number,
  exclude?: (slot: TrackTalk) => boolean,
  intervalMinutes = 5,
): string[] {
  const endBound = toMinutes(SCHEDULE_END)
  return generateTimeSlots(SCHEDULE_START, SCHEDULE_END, intervalMinutes)
    .map((s) => s.time)
    .filter((time) => {
      if (toMinutes(calculateEndTime(time, durationMinutes)) > endBound) {
        return false
      }
      return fitsInTrack(track, time, durationMinutes, exclude)
    })
}

function speakerNamesOf(proposal: ProposalExisting): string | null {
  const populated = Array.isArray(proposal.speakers)
    ? (proposal.speakers.filter(
        (s) => s && typeof s === 'object' && 'name' in s,
      ) as Speaker[])
    : []
  return populated.length > 0 ? formatSpeakerNames(populated) : null
}

/** Talks in a track ordered by start time (does not mutate the source array). */
function sortTalks(track: ScheduleTrack): TrackTalk[] {
  return [...track.talks].sort((a, b) => a.startTime.localeCompare(b.startTime))
}

/**
 * Horizontal swipe detector for track navigation. Fires `onSwipe(1)` on a
 * left swipe (next track) and `onSwipe(-1)` on a right swipe, but only when the
 * gesture is clearly horizontal so it never hijacks vertical agenda scrolling.
 */
function useSwipeNavigation(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0]
      start.current = { x: touch.clientX, y: touch.clientY }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - start.current.x
      const dy = touch.clientY - start.current.y
      start.current = null
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onSwipe(dx < 0 ? 1 : -1)
      }
    },
  }
}

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-xl dark:bg-gray-900"
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
/* Agenda card                                                                */
/* -------------------------------------------------------------------------- */

function AgendaCard({ talk, onTap }: { talk: TrackTalk; onTap: () => void }) {
  const isService = !talk.talk
  const proposal = talk.talk
  const duration = durationBetween(talk.startTime, talk.endTime)
  const title = proposal?.title ?? talk.placeholder ?? 'Untitled'
  const speakers = proposal ? speakerNamesOf(proposal) : null

  return (
    <button
      type="button"
      onClick={onTap}
      className={`flex w-full ${TAP_TARGET} flex-col gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        isService
          ? 'border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/60'
          : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        <span className="tabular-nums">
          {talk.startTime}–{talk.endTime}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <ClockIcon className="h-3.5 w-3.5" />
          {duration}m
        </span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {proposal && (
          <LevelIndicator
            level={proposal.level}
            size="xs"
            className="mt-0.5 shrink-0"
          />
        )}
      </div>

      {isService ? (
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Service session
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {proposal && (
            <StatusBadge status={proposal.status} variant="compact" />
          )}
          {speakers && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <UserIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{speakers}</span>
            </span>
          )}
        </div>
      )}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Time picker (shared by assign + move)                                      */
/* -------------------------------------------------------------------------- */

function TimeSelect({
  id,
  slots,
  value,
  onChange,
}: {
  id: string
  slots: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-1">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="col-start-1 row-start-1 w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pr-8 pl-3 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        {slots.map((slot) => (
          <option key={slot} value={slot}>
            {slot}
          </option>
        ))}
      </select>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Assign sheet                                                               */
/* -------------------------------------------------------------------------- */

function AssignSheet({
  track,
  trackTitle,
  trackIndex,
  proposals,
  dispatch,
  onClose,
}: {
  track: ScheduleTrack
  trackTitle: string
  trackIndex: number
  proposals: ProposalExisting[]
  dispatch: React.Dispatch<ScheduleAction>
  onClose: () => void
}) {
  const filters = useProposalFilters(proposals)
  const [selected, setSelected] = useState<ProposalExisting | null>(null)
  const [startTime, setStartTime] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const duration = selected ? getProposalDurationMinutes(selected) : 0
  const slots = useMemo(
    () => (selected ? freeStartTimes(track, duration) : []),
    [track, selected, duration],
  )

  const pickProposal = useCallback(
    (proposal: ProposalExisting) => {
      setSelected(proposal)
      setInlineError(null)
      const free = freeStartTimes(track, getProposalDurationMinutes(proposal))
      if (free.length === 0) {
        setInlineError('No free time slot for this talk in this track.')
        setStartTime('')
      } else {
        setStartTime(free[0])
      }
    },
    [track],
  )

  const confirm = useCallback(() => {
    if (!selected || !startTime) return
    const endTime = calculateEndTime(startTime, duration)
    if (
      toMinutes(endTime) > toMinutes(SCHEDULE_END) ||
      !fitsInTrack(track, startTime, duration)
    ) {
      setInlineError('That slot overlaps another item or runs past end of day.')
      return
    }
    dispatch({
      type: 'moveProposal',
      dragItem: { type: 'proposal', proposal: selected },
      dropPosition: { trackIndex, timeSlot: startTime },
    })
    onClose()
  }, [selected, startTime, duration, track, trackIndex, dispatch, onClose])

  if (selected) {
    return (
      <BottomSheet title="Pick a start time" onClose={onClose}>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to talks
        </button>

        <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {selected.title}
        </p>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          {duration} min · into {trackTitle}
        </p>

        {slots.length > 0 ? (
          <>
            <label
              htmlFor="assign-start-time"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Start time
            </label>
            <TimeSelect
              id="assign-start-time"
              slots={slots}
              value={startTime}
              onChange={setStartTime}
            />
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No free time slot for this talk in this track.
          </p>
        )}

        {inlineError && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            {inlineError}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={confirm}
            disabled={!startTime}
            className={`flex-1 ${PRIMARY_BUTTON}`}
          >
            Assign
          </button>
        </div>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet title="Assign a talk" onClose={onClose}>
      <div className="relative mb-4">
        <ProposalFilters filters={filters} />
      </div>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {filters.statsText}
      </p>

      {filters.filteredProposals.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {proposals.length === 0
            ? 'No unassigned talks left.'
            : 'No talks match your filters.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filters.filteredProposals.map((proposal) => {
            const speakers = speakerNamesOf(proposal)
            return (
              <li key={proposal._id}>
                <button
                  type="button"
                  onClick={() => pickProposal(proposal)}
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
                      {getProposalDurationMinutes(proposal)}m
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
/* Move sheet (scheduled talk -> another track/time)                          */
/* -------------------------------------------------------------------------- */

function MoveSheet({
  tracks,
  sourceTrackIndex,
  talk,
  dispatch,
  onClose,
}: {
  tracks: ScheduleTrack[]
  sourceTrackIndex: number
  talk: TrackTalk
  dispatch: React.Dispatch<ScheduleAction>
  onClose: () => void
}) {
  const proposal = talk.talk!
  const duration = getProposalDurationMinutes(proposal)
  const [targetTrackIndex, setTargetTrackIndex] = useState(sourceTrackIndex)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const slots = useMemo(() => {
    const target = tracks[targetTrackIndex]
    if (!target) return []
    const exclude =
      targetTrackIndex === sourceTrackIndex
        ? matchTalk(proposal._id, talk.startTime)
        : undefined
    return freeStartTimes(target, duration, exclude)
  }, [
    tracks,
    targetTrackIndex,
    sourceTrackIndex,
    proposal._id,
    talk.startTime,
    duration,
  ])

  // `startTime` starts empty and is only ever set by the user; the effective
  // value falls back to the first free slot so we never need a setState-in-effect
  // to "reset" it when the track (and its slot list) changes.
  const [startTime, setStartTime] = useState('')
  const effectiveStart = slots.includes(startTime)
    ? startTime
    : (slots[0] ?? '')

  const confirm = useCallback(() => {
    if (!effectiveStart) return
    dispatch({
      type: 'moveProposal',
      dragItem: {
        type: 'scheduled-talk',
        proposal,
        sourceTrackIndex,
        sourceTimeSlot: talk.startTime,
      },
      dropPosition: { trackIndex: targetTrackIndex, timeSlot: effectiveStart },
    })
    onClose()
  }, [
    effectiveStart,
    proposal,
    sourceTrackIndex,
    talk.startTime,
    targetTrackIndex,
    dispatch,
    onClose,
  ])

  return (
    <BottomSheet title="Move talk" onClose={onClose}>
      <p className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {proposal.title}
      </p>

      <label
        htmlFor="move-track"
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Track
      </label>
      <div className="mb-4 grid grid-cols-1">
        <select
          id="move-track"
          value={targetTrackIndex}
          onChange={(e) => {
            setTargetTrackIndex(Number(e.target.value))
            setInlineError(null)
          }}
          className="col-start-1 row-start-1 w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pr-8 pl-3 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          {tracks.map((track, index) => (
            <option key={index} value={index}>
              {track.trackTitle || `Track ${index + 1}`}
            </option>
          ))}
        </select>
      </div>

      {slots.length > 0 ? (
        <>
          <label
            htmlFor="move-start-time"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Start time
          </label>
          <TimeSelect
            id="move-start-time"
            slots={slots}
            value={effectiveStart}
            onChange={setStartTime}
          />
        </>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No free time slot in this track.
        </p>
      )}

      {inlineError && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
        >
          {inlineError}
        </p>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={confirm}
          disabled={!effectiveStart}
          className={`w-full ${PRIMARY_BUTTON}`}
        >
          Move here
        </button>
      </div>
    </BottomSheet>
  )
}

/* -------------------------------------------------------------------------- */
/* Card action sheet                                                          */
/* -------------------------------------------------------------------------- */

function CardActionSheet({
  talk,
  trackIndex,
  talkIndex,
  dispatch,
  onClose,
  onMove,
}: {
  talk: TrackTalk
  trackIndex: number
  talkIndex: number
  dispatch: React.Dispatch<ScheduleAction>
  onClose: () => void
  onMove: () => void
}) {
  const isService = !talk.talk
  const [mode, setMode] = useState<'menu' | 'rename' | 'duration'>('menu')
  const [renameValue, setRenameValue] = useState(talk.placeholder ?? '')
  const [durationValue, setDurationValue] = useState(
    String(durationBetween(talk.startTime, talk.endTime)),
  )
  const title = talk.talk?.title ?? talk.placeholder ?? 'Untitled'

  const remove = useCallback(() => {
    dispatch({ type: 'removeTalk', trackIndex, talkIndex })
    onClose()
  }, [dispatch, trackIndex, talkIndex, onClose])

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
            onClick={() => setMode('menu')}
            className={`flex-1 ${SECONDARY_BUTTON}`}
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    )
  }

  if (mode === 'duration') {
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
    <BottomSheet title={title} onClose={onClose}>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        {talk.startTime}–{talk.endTime}
        {isService ? ' · Service session' : ''}
      </p>
      <div className="space-y-2">
        {!isService && (
          <button
            type="button"
            onClick={onMove}
            className={`w-full justify-start ${SECONDARY_BUTTON}`}
          >
            <ArrowsRightLeftIcon className="h-5 w-5" />
            Move to another track / time
          </button>
        )}
        {isService && (
          <>
            <button
              type="button"
              onClick={() => setMode('rename')}
              className={`w-full justify-start ${SECONDARY_BUTTON}`}
            >
              <PencilIcon className="h-5 w-5" />
              Rename session
            </button>
            <button
              type="button"
              onClick={() => setMode('duration')}
              className={`w-full justify-start ${SECONDARY_BUTTON}`}
            >
              <ArrowsUpDownIcon className="h-5 w-5" />
              Change duration
            </button>
          </>
        )}
        <button
          type="button"
          onClick={remove}
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
/* Add service sheet                                                          */
/* -------------------------------------------------------------------------- */

function AddServiceSheet({
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
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState('10')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const slots = useMemo(
    () => freeStartTimes(track, Number(duration)),
    [track, duration],
  )
  const [startTime, setStartTime] = useState('')
  const effectiveStart = slots.includes(startTime)
    ? startTime
    : (slots[0] ?? '')

  const confirm = useCallback(() => {
    if (!title.trim() || !effectiveStart) {
      setInlineError('Enter a title and pick a free start time.')
      return
    }
    const endTime = calculateEndTime(effectiveStart, Number(duration))
    if (
      toMinutes(endTime) > toMinutes(SCHEDULE_END) ||
      !isTrackIntervalFree(track, effectiveStart, endTime)
    ) {
      setInlineError('That slot overlaps another item or runs past end of day.')
      return
    }
    dispatch({
      type: 'addService',
      trackIndex,
      title: title.trim(),
      startTime: effectiveStart,
      duration: Number(duration),
    })
    onClose()
  }, [title, effectiveStart, duration, track, trackIndex, dispatch, onClose])

  return (
    <BottomSheet title="Add service session" onClose={onClose}>
      <label
        htmlFor="service-title"
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Session title
      </label>
      <input
        id="service-title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Coffee Break, Lunch"
        className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
        autoFocus
      />

      <div className="mb-4">
        <Dropdown
          name="new-service-duration"
          label="Duration (minutes)"
          options={SERVICE_DURATION_OPTIONS}
          value={duration}
          setValue={setDuration}
        />
      </div>

      {slots.length > 0 ? (
        <>
          <label
            htmlFor="service-start-time"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Start time
          </label>
          <TimeSelect
            id="service-start-time"
            slots={slots}
            value={effectiveStart}
            onChange={setStartTime}
          />
        </>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No free time slot of this length in this track.
        </p>
      )}

      {inlineError && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
        >
          {inlineError}
        </p>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={confirm}
          disabled={!effectiveStart || !title.trim()}
          className={`w-full ${PRIMARY_BUTTON}`}
        >
          Add session
        </button>
      </div>
    </BottomSheet>
  )
}

/* -------------------------------------------------------------------------- */
/* Unassigned drawer                                                          */
/* -------------------------------------------------------------------------- */

function UnassignedDrawer({
  proposals,
  onClose,
}: {
  proposals: ProposalExisting[]
  onClose: () => void
}) {
  const filters = useProposalFilters(proposals)
  return (
    <BottomSheet title={`Unassigned (${proposals.length})`} onClose={onClose}>
      <div className="relative mb-4">
        <ProposalFilters filters={filters} />
      </div>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {filters.statsText}
      </p>
      {filters.filteredProposals.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {proposals.length === 0
            ? 'Every talk has been scheduled.'
            : 'No talks match your filters.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filters.filteredProposals.map((proposal) => {
            const speakers = speakerNamesOf(proposal)
            return (
              <li
                key={proposal._id}
                className={`flex ${TAP_TARGET} flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800`}
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
                    {getProposalDurationMinutes(proposal)}m
                  </span>
                  {speakers && (
                    <span className="inline-flex items-center gap-1 truncate text-xs text-gray-600 dark:text-gray-400">
                      <UserIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{speakers}</span>
                    </span>
                  )}
                </div>
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
/* Main view                                                                  */
/* -------------------------------------------------------------------------- */

type ActiveSheet =
  | { kind: 'assign' }
  | { kind: 'addService' }
  | { kind: 'unassigned' }
  | { kind: 'card'; talkIndex: number }
  | { kind: 'move'; talkIndex: number }
  | null

export function MobileScheduleView({
  schedules,
  currentDayIndex,
  unassignedProposals,
  dispatch,
  onSave,
  onAddTrack,
  isSaving,
  saveSuccess,
  error,
}: MobileScheduleViewProps) {
  const schedule = schedules[currentDayIndex] ?? null
  const tracks = useMemo(() => schedule?.tracks ?? [], [schedule])

  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0)
  const [sheet, setSheet] = useState<ActiveSheet>(null)

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

  const currentTrack = tracks[safeTrackIndex] ?? null

  const sortedTalks = useMemo(
    () => (currentTrack ? sortTalks(currentTrack) : []),
    [currentTrack],
  )

  const closeSheet = useCallback(() => setSheet(null), [])

  const goToTrack = useCallback(
    (index: number) => {
      if (index >= 0 && index < tracks.length) setSelectedTrackIndex(index)
    },
    [tracks.length],
  )

  const swipe = useSwipeNavigation(
    useCallback(
      (direction: 1 | -1) => goToTrack(safeTrackIndex + direction),
      [goToTrack, safeTrackIndex],
    ),
  )

  const handleDayChange = useCallback(
    (dayIndex: number) => {
      dispatch({ type: 'changeDay', dayIndex })
      setSelectedTrackIndex(0)
      setSheet(null)
    },
    [dispatch],
  )

  // The action sheet stores a talkIndex into the SORTED list; translate it back
  // to the real index in `currentTrack.talks` for reducer actions.
  const realTalkIndex = useCallback(
    (talk: TrackTalk): number =>
      currentTrack
        ? currentTrack.talks.findIndex(
            (t) => t.startTime === talk.startTime && t.endTime === talk.endTime,
          )
        : -1,
    [currentTrack],
  )

  const sheetTalk =
    sheet && (sheet.kind === 'card' || sheet.kind === 'move')
      ? sortedTalks[sheet.talkIndex]
      : null

  return (
    <TabGroup
      as="div"
      className="flex h-[calc(100dvh-4rem)] flex-col bg-gray-50 dark:bg-gray-950"
      selectedIndex={safeTrackIndex}
      onChange={setSelectedTrackIndex}
    >
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 pt-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            Schedule
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSheet({ kind: 'unassigned' })}
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

        {schedules.length > 1 && (
          <div
            className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1"
            role="group"
            aria-label="Select day"
          >
            {schedules.map((day, index) => {
              const isActive = index === currentDayIndex
              const label = new Date(day.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
              return (
                <button
                  key={`${index}-${day.date}`}
                  type="button"
                  onClick={() => handleDayChange(index)}
                  aria-pressed={isActive}
                  className={clsx(
                    'min-h-[44px] shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500',
                    isActive
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300',
                  )}
                >
                  Day {index + 1} · {label}
                </button>
              )
            })}
          </div>
        )}

        {/* Swipeable track tabs */}
        {tracks.length > 0 ? (
          <TabList className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-3">
            {tracks.map((track, index) => (
              <Tab
                key={index}
                className={clsx(
                  'min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                  index === safeTrackIndex
                    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {track.trackTitle || `Track ${index + 1}`}
              </Tab>
            ))}
            <button
              type="button"
              onClick={onAddTrack}
              aria-label="Add track"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 bg-white px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <PlusIcon className="h-4 w-4" />
              Track
            </button>
          </TabList>
        ) : (
          <div className="pb-3" />
        )}
      </header>

      {error && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Agenda */}
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
        <TabPanels
          as="main"
          className="flex-1 overflow-y-auto px-4 py-4"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
        >
          {tracks.map((track, trackIndex) => {
            const talks = sortTalks(track)
            return (
              <TabPanel key={trackIndex} className="focus:outline-none">
                <div className="mb-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: 'addService' })}
                    className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Service
                  </button>
                </div>

                {talks.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Nothing scheduled in this track yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {talks.map((talk, index) => (
                      <li key={`${talk.startTime}-${talk.endTime}-${index}`}>
                        <AgendaCard
                          talk={talk}
                          onTap={() =>
                            setSheet({ kind: 'card', talkIndex: index })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => setSheet({ kind: 'assign' })}
                  className={`mt-4 w-full ${PRIMARY_BUTTON}`}
                >
                  <PlusIcon className="h-5 w-5" />
                  Assign a talk
                </button>
              </TabPanel>
            )
          })}
        </TabPanels>
      )}

      {/* Sheets */}
      {sheet?.kind === 'assign' && currentTrack && (
        <AssignSheet
          track={currentTrack}
          trackTitle={currentTrack.trackTitle || `Track ${safeTrackIndex + 1}`}
          trackIndex={safeTrackIndex}
          proposals={unassignedProposals}
          dispatch={dispatch}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === 'addService' && currentTrack && (
        <AddServiceSheet
          track={currentTrack}
          trackIndex={safeTrackIndex}
          dispatch={dispatch}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === 'unassigned' && (
        <UnassignedDrawer
          proposals={unassignedProposals}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === 'card' && sheetTalk && (
        <CardActionSheet
          talk={sheetTalk}
          trackIndex={safeTrackIndex}
          talkIndex={realTalkIndex(sheetTalk)}
          dispatch={dispatch}
          onClose={closeSheet}
          onMove={() => setSheet({ kind: 'move', talkIndex: sheet.talkIndex })}
        />
      )}

      {sheet?.kind === 'move' && sheetTalk && sheetTalk.talk && (
        <MoveSheet
          tracks={tracks}
          sourceTrackIndex={safeTrackIndex}
          talk={sheetTalk}
          dispatch={dispatch}
          onClose={closeSheet}
        />
      )}
    </TabGroup>
  )
}
