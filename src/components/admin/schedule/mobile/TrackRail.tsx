'use client'

import { useMemo } from 'react'
import clsx from 'clsx'
import { ScheduleTrack } from '@/lib/conference/types'
import { StatusBadge, LevelIndicator } from '@/lib/proposal'
import { populatedSpeakerNames } from '@/lib/speaker/formatSpeakerNames'
import {
  PlusIcon,
  ClockIcon,
  UserIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'

import { buildTrackRail, type RailSegment } from './rail'
import { GUTTER_PX, MIN_OPEN_SLOT_MIN } from './constants'
import { segmentHeight, segmentLabel } from './railGeometry'
import { segmentState } from './placement'
import type { Placing, SegmentState } from './types'
import { DurationChip } from './chrome'

/* -------------------------------------------------------------------------- */
/* Rail segment body                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One track's hybrid time-rail: a continuous gutter line with a node per
 * segment, and duration-proportional (clamped) bodies. When `placing` is set the
 * rail is a target picker — only valid segments are enabled and highlighted.
 */
export function TrackRail({
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
