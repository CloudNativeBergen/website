'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { scheduledProposalIdsExcludingDay } from '@/lib/schedule/operations'
import {
  PlusIcon,
  BookmarkIcon,
  CheckCircleIcon,
  InboxStackIcon,
} from '@heroicons/react/24/outline'

import { buildTrackRail, type RailSegment } from './rail'
import { PRIMARY_BUTTON } from './constants'
import { segmentState } from './placement'
import type { ActiveSheet, MobileScheduleViewProps, Placing } from './types'
import { DaySelect, LegendDisclosure, PlacingBanner } from './chrome'
import { TrackRail } from './TrackRail'
import { UnassignedDrawer } from './sheets/UnassignedDrawer'
import { CardActionSheet } from './sheets/CardActionSheet'
import { TrackActionSheet } from './sheets/TrackActionSheet'
import { ServiceEditSheet } from './sheets/ServiceEditSheet'

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
