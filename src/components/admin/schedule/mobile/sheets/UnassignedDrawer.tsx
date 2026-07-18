'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ScheduleTrack } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { ScheduleAction } from '@/lib/schedule/reducer'
import {
  SCHEDULE_END,
  calculateEndTime,
  getProposalDurationMinutes,
  toMinutes,
  withinScheduleEnd,
} from '@/lib/schedule/time'
import { SERVICE_DURATION_OPTIONS } from '@/lib/schedule/constants'
import { fitsInTrack, isTrackIntervalFree } from '@/lib/schedule/rules'
import { StatusBadge, LevelIndicator } from '@/lib/proposal'
import { populatedSpeakerNames } from '@/lib/speaker/formatSpeakerNames'
import { Dropdown } from '@/components/Form'
import {
  PlusIcon,
  ClockIcon,
  UserIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'

import { useProposalFilters } from '../../useProposalFilters'
import { ProposalFilters } from '../../ProposalFilters'
import { BottomSheet } from '../BottomSheet'
import { PRIMARY_BUTTON, TAP_TARGET } from '../constants'
import type { SlotContext } from '../types'

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
export function UnassignedDrawer({
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
