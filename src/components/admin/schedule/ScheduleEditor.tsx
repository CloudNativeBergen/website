'use client'

import './schedule.css'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
} from '@dnd-kit/core'
import {
  useState,
  useReducer,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useTransition,
  type Dispatch,
} from 'react'
import React from 'react'
import { ScheduleTrack, TrackTalk, Conference } from '@/lib/conference/types'
import { DragItem, type EditorSchedule } from '@/lib/schedule/types'
import {
  scheduleReducer,
  initScheduleEditorState,
  type ScheduleAction,
} from '@/lib/schedule/reducer'
import {
  computeUnassigned,
  scheduledProposalIdsExcludingDay,
} from '@/lib/schedule/operations'
import { ProposalExisting } from '@/lib/proposal/types'
import { UnassignedProposals } from './UnassignedProposals'
import { useProposalFilters } from './useProposalFilters'
import { MemoizedDroppableTrack as DroppableTrack } from './DroppableTrack'
import { DraggableProposal } from './DraggableProposal'
import { DraggableServiceSession } from './DraggableServiceSession'
import { MobileScheduleView } from './mobile'
import { HeaderSection } from './HeaderSection'
import { AddTrackModal } from './AddTrackModal'
import { ScheduleProvider } from './ScheduleContext'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { api } from '@/lib/trpc/client'
import {
  PlusIcon,
  CalendarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ScheduleEditorProps {
  officialSchedules: EditorSchedule[]
  draftSchedules: EditorSchedule[]
  conference: Conference
  initialProposals: ProposalExisting[]
}

const PRIMARY_BUTTON =
  'inline-flex items-center gap-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600'

const LAYOUT_CLASSES = {
  container: 'flex h-[calc(100vh-5rem)]',
  mainArea: 'flex flex-1 flex-col min-h-0 min-w-0',
  content: 'flex-1 min-h-0 overflow-x-auto px-2 pt-4',
  tracksGrid: 'flex gap-4 h-max',
  emptyState: 'flex flex-1 items-center justify-center',
  errorBanner:
    'border-b border-red-200 bg-red-50 px-4 py-2 shrink-0 dark:border-red-800 dark:bg-red-900/20',
} as const

const ErrorBanner = React.memo(
  ({
    error,
    onRefresh,
    isRefreshing,
  }: {
    error: string
    onRefresh?: () => void
    isRefreshing?: boolean
  }) => (
    <div className={LAYOUT_CLASSES.errorBanner}>
      <div className="flex items-center justify-between">
        <p className="text-red-800 dark:text-red-300">{error}</p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="ml-4 inline-flex shrink-0 items-center gap-2 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 transition-colors hover:bg-red-200 focus:ring-2 focus:ring-red-500 focus:ring-offset-1 focus:ring-offset-red-50 focus:outline-none disabled:opacity-50 dark:bg-red-900/50 dark:text-red-200 dark:hover:bg-red-900/80 dark:focus:ring-offset-red-900"
          >
            {isRefreshing && (
              <svg
                className="h-4 w-4 animate-spin text-red-800 dark:text-red-200"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        )}
      </div>
    </div>
  ),
)
ErrorBanner.displayName = 'ErrorBanner'

const EmptyState = React.memo(
  ({
    onAddTrack,
    isReadOnly = false,
  }: {
    onAddTrack: () => void
    isReadOnly?: boolean
  }) => (
    <div className={LAYOUT_CLASSES.emptyState}>
      <div className="text-center">
        <p className="mb-4 text-gray-500 dark:text-gray-400">
          {isReadOnly
            ? 'This day has no published tracks'
            : 'No tracks created yet'}
        </p>
        {/* In the live (read-only) view there is no save path, so don't offer
            an edit that could never be persisted. */}
        {!isReadOnly && (
          <button onClick={onAddTrack} className={PRIMARY_BUTTON} type="button">
            <PlusIcon className="h-4 w-4" />
            Create First Track
          </button>
        )}
      </div>
    </div>
  ),
)
EmptyState.displayName = 'EmptyState'

/**
 * Shown when the editor has NO days at all.
 *
 * `getScheduleData()` builds one day per date between the conference start and
 * end, so a conference provisioned without dates (see `buildOnboardingDocuments`)
 * produces zero days. The board used to render its ordinary "No tracks created
 * yet" empty state anyway, complete with a Create First Track button — which
 * opened the modal, took a track name, and dropped it on the floor, because the
 * reducer has no day to attach it to. This state replaces that button entirely,
 * so the discard is unreachable rather than merely explained.
 */
const NoConferenceDatesState = React.memo(() => (
  <div className="flex h-[calc(100vh-5rem)] items-center justify-center p-6">
    <div className="max-w-md text-center">
      <CalendarIcon className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500" />
      <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
        Set your conference dates first
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        The schedule is built one day at a time, so there is nothing to build
        until the conference has a start and end date. Add them in settings and
        this page opens on day one.
      </p>
      <Link
        href="/admin/settings"
        className={`mt-5 ${PRIMARY_BUTTON}`}
        prefetch={false}
      >
        <Cog6ToothIcon className="h-4 w-4" />
        Go to conference settings
      </Link>
    </div>
  </div>
))
NoConferenceDatesState.displayName = 'NoConferenceDatesState'

const TracksGrid = ({
  tracks,
  onUpdateTrack,
  onRemoveTrack,
  onRemoveTalk,
  onDuplicateServiceSession,
  onAddServiceSession,
  onResizeServiceSession,
  onRenameServiceSession,
}: {
  tracks: ScheduleTrack[]
  onUpdateTrack: (index: number, track: ScheduleTrack) => void
  onRemoveTrack: (index: number) => void
  onRemoveTalk: (trackIndex: number, talkIndex: number) => void
  onDuplicateServiceSession: (
    serviceSession: TrackTalk,
    sourceTrackIndex: number,
  ) => void
  onAddServiceSession: (
    trackIndex: number,
    startTime: string,
    title: string,
    duration: number,
  ) => void
  onResizeServiceSession: (
    trackIndex: number,
    talkIndex: number,
    duration: number,
  ) => void
  onRenameServiceSession: (
    trackIndex: number,
    talkIndex: number,
    title: string,
  ) => void
}) => {
  return (
    <div className={LAYOUT_CLASSES.tracksGrid}>
      {tracks.map((track, index) => (
        <DroppableTrack
          key={`track-${index}-${track.trackTitle}`}
          track={track}
          trackIndex={index}
          onUpdateTrack={(updatedTrack) => onUpdateTrack(index, updatedTrack)}
          onRemoveTrack={() => onRemoveTrack(index)}
          onRemoveTalk={(talkIndex) => onRemoveTalk(index, talkIndex)}
          onDuplicateServiceSession={onDuplicateServiceSession}
          onAddServiceSession={(startTime, title, duration) =>
            onAddServiceSession(index, startTime, title, duration)
          }
          onResizeServiceSession={(talkIndex, duration) =>
            onResizeServiceSession(index, talkIndex, duration)
          }
          onRenameServiceSession={(talkIndex, title) =>
            onRenameServiceSession(index, talkIndex, title)
          }
        />
      ))}
    </div>
  )
}

const MemoizedTracksGrid = React.memo(TracksGrid)
MemoizedTracksGrid.displayName = 'MemoizedTracksGrid'

export function ScheduleEditor({
  officialSchedules,
  draftSchedules,
  initialProposals,
}: ScheduleEditorProps) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const [showAddTrackModal, setShowAddTrackModal] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const dndId = React.useId()

  const [isDraftMode, setIsDraftMode] = useState(true)

  // Live mode shows the OFFICIAL schedule, which has no save path at all
  // (autosave and the Save button are draft-only). Editing it therefore has to
  // be impossible, not merely unsaveable — see `editDispatch` and the
  // `isReadOnly` context flag that hides every affordance.
  const isReadOnly = !isDraftMode

  const mergedSchedules = useMemo(() => {
    if (!isDraftMode) return officialSchedules

    return draftSchedules.map((draftDay, i) => {
      const officialDay = officialSchedules[i]
      if (!draftDay._id && officialDay && officialDay._id) {
        return {
          ...officialDay,
          status: 'draft',
          _id: '',
          _rev: undefined,
        } as EditorSchedule
      }
      return draftDay
    })
  }, [isDraftMode, draftSchedules, officialSchedules])

  // Desktop is the SSR default (`true`), so wide screens never flash the mobile
  // layout and there is no hydration mismatch; phones flip to the tap-driven
  // view after mount. The two layouts are mutually exclusive so the drag board's
  // DndContext (and its touch sensors) is never mounted on a phone.
  const isDesktop = useMediaQuery('(min-width: 768px)', true)
  const router = useRouter()
  const utils = api.useUtils()
  const saveMutation = api.schedule.save.useMutation()
  const actionMutation = api.schedule.action.useMutation()

  // Polling for external changes
  const { data: latestVersions } = api.schedule.admin.pollVersions.useQuery(
    undefined,
    {
      refetchInterval: 10000,
    },
  )

  const { data: updatedStatuses } =
    api.schedule.admin.pollProposalsStatus.useQuery(undefined, {
      refetchInterval: 10000,
    })

  const [externalChangeError, setExternalChangeError] = useState<string | null>(
    null,
  )

  // Single reducer over ALL days. The active day is `state.currentDayIndex`
  // (identity), never an `_id` — see reducer.ts for why that fixes the
  // day-collision bug. There is no second store to hand-sync.
  const [state, dispatch] = useReducer(
    scheduleReducer,
    { schedules: mergedSchedules, proposals: initialProposals },
    initScheduleEditorState,
  )

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    dispatch({ type: 'resetSchedules', schedules: mergedSchedules })
  }, [mergedSchedules])

  useEffect(() => {
    if (updatedStatuses) {
      // Use raw dispatch to update proposals in the background without affecting dirty state
      dispatch({ type: 'updateProposalsStatus', statuses: updatedStatuses })
    }
  }, [updatedStatuses])

  // Every MUTATING dispatch goes through here. In live mode it is a no-op, so
  // even a path that forgets to hide its affordance (or a stale keyboard
  // shortcut) cannot push the editor into a dirty state that has no save path
  // and would be silently wiped by the next `resetSchedules`. Save/lifecycle
  // actions (`saveStart`, `changeDay`, …) keep using the raw `dispatch`.
  const editDispatch = useCallback<Dispatch<ScheduleAction>>(
    (action) => {
      if (isReadOnly) return
      dispatch(action)
    },
    [isReadOnly],
  )

  const currentDayIndex = state.currentDayIndex
  const currentSchedule = state.schedules[currentDayIndex] ?? null
  const isSaving = state.ui.isSaving
  const error = externalChangeError || state.ui.error

  // One filter state for the WHOLE editor, not just the sidebar: the unassigned
  // list filters down to matches, and the board dims the cards that fall out
  // (see `isFilteredOut` below), so both surfaces answer the same question.
  const filters = useProposalFilters(state.proposals)

  // ANY dirty day means unsaved work — surfaced on both headers' Save button
  // and guarding navigation below.
  const hasUnsavedChanges = state.dirty.some(Boolean)

  // Warn before a tab close / hard navigation while any day is dirty. (In-app
  // route changes aren't guarded here — the editor is a single page.)
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Chrome requires returnValue to be set for the prompt to show.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  // Guard: after calling router.refresh(), the new SSR props will have updated
  // _rev values while react-query's latestVersions cache still holds stale data
  // from the previous poll. Without a cooldown, the effect immediately sees a
  // mismatch (new prop _rev ≠ stale cached _rev) and fires ANOTHER refresh —
  // creating an infinite loop. After a refresh we skip comparisons until the
  // next poll cycle has a chance to fetch fresh versions that match the new props.
  const lastRefreshRef = useRef(0)
  const [isRefreshing, startTransition] = useTransition()

  const handleRefreshData = useCallback(() => {
    setExternalChangeError(null)
    lastRefreshRef.current = Date.now()
    startTransition(() => {
      router.refresh()
    })
    utils.schedule.admin.pollVersions.invalidate()
  }, [router, utils])

  // Every revision this client has ever HELD for a day: the ones loaded from the
  // server props plus the ones our own saves produced.
  //
  // Why a set and not a `serverRev !== localRev` compare: `pollVersions` only
  // refetches every 10s and nothing invalidated it on save, so for most of the
  // window after an autosave (which fires every ~3s) the polled `_rev` is simply
  // the revision WE just replaced. Comparing it against the fresh local `_rev`
  // flagged the user's own save as an "external change", so the banner — and its
  // Refresh Data button, which discards un-autosaved work — was up almost
  // permanently and a REAL conflict was indistinguishable from the noise.
  // Matching against known revisions instead means only a revision this client
  // has never seen (i.e. written by somebody else) raises the banner.
  const knownRevsRef = useRef<Map<string, Set<string>>>(new Map())
  const rememberRev = useCallback((id?: string, rev?: string) => {
    if (!id || !rev) return
    const known = knownRevsRef.current
    let revs = known.get(id)
    if (!revs) {
      revs = new Set()
      known.set(id, revs)
    }
    revs.add(rev)
  }, [])

  // Detect external changes: a polled revision we have never held ourselves.
  useEffect(() => {
    // Record first, compare second — the revisions we currently hold are by
    // definition not foreign.
    for (const loaded of state.schedules) {
      rememberRev(loaded._id, loaded._rev)
    }

    if (!latestVersions) return
    // A poll that lands between the server committing our save and the mutation
    // resolving would carry a revision we haven't recorded yet. Skip while a
    // save is in flight; the effect re-runs when `state.schedules` updates.
    if (isSaving) return

    // Skip comparison during cooldown after a router.refresh()
    const elapsed = Date.now() - lastRefreshRef.current
    if (elapsed < 15000) return

    let changed = false
    for (const loaded of state.schedules) {
      if (!loaded._id) continue // New local day, no server counterpart yet
      const known = knownRevsRef.current.get(loaded._id)
      // No baseline for this day (it never carried a `_rev`) — there is nothing
      // to compare against, so don't cry conflict.
      if (!known || known.size === 0) continue
      const server = latestVersions.find((s) => s._id === loaded._id)
      if (server?._rev && !known.has(server._rev)) {
        changed = true
        break
      }
    }

    if (changed) {
      setExternalChangeError(
        'There are new external changes to this schedule. Please reload to sync (your local changes will be lost).',
      )
    } else {
      setExternalChangeError(null)
    }
  }, [latestVersions, state.schedules, isSaving, rememberRev])

  // The saved-flash timeout is stored so a new save (or unmount) cancels the
  // previous one instead of leaking it / clearing the wrong flash.
  const saveSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  useEffect(
    () => () => {
      if (saveSuccessTimeoutRef.current !== null) {
        clearTimeout(saveSuccessTimeoutRef.current)
      }
    },
    [],
  )

  // Unassigned proposals are DERIVED from all days, never stored.
  const unassignedProposals = useMemo(
    () => computeUnassigned(state.proposals, state.schedules),
    [state.proposals, state.schedules],
  )

  // The exact `state.schedules` identity a save FAILED on. Autosave stays parked
  // while it still matches the live one; any edit (every reducer edit replaces
  // the array) or an explicit Save clears it. See the autosave effect.
  const [failedSaveSnapshot, setFailedSaveSnapshot] = useState<
    EditorSchedule[] | null
  >(null)
  const autoSaveSuspended =
    failedSaveSnapshot !== null && failedSaveSnapshot === state.schedules

  const handleSave = useCallback(async () => {
    // An explicit Save is the user's "retry" — always re-arm autosave.
    const attemptedSnapshot = state.schedules
    setFailedSaveSnapshot(null)
    dispatch({ type: 'saveStart' })
    setSaveSuccess(false)
    if (saveSuccessTimeoutRef.current !== null) {
      clearTimeout(saveSuccessTimeoutRef.current)
      saveSuccessTimeoutRef.current = null
    }

    // Persist every DIRTY day so edits on non-current days are not dropped. If
    // nothing is dirty, fall back to saving the current day (matches the old
    // always-save-current behaviour).
    const dirtyIndices = state.dirty
      .map((isDirty, index) => (isDirty ? index : -1))
      .filter((index) => index >= 0)
    const indicesToSave =
      dirtyIndices.length > 0 ? dirtyIndices : [currentDayIndex]

    try {
      for (const index of indicesToSave) {
        const daySchedule = state.schedules[index]
        if (!daySchedule) continue

        const { schedule } = await saveMutation.mutateAsync(daySchedule)
        if (schedule) {
          dispatch({
            type: 'saveDaySucceeded',
            index,
            _id: schedule._id,
            _rev: schedule._rev,
            // Pass the EXACT object we sent so the reducer can identity-compare
            // it against the current day and detect an edit made mid-save (which
            // must stay dirty rather than be marked clean and lost).
            saved: daySchedule,
          })
          // Advance the polled baseline with the revision WE just wrote, both in
          // the known-revision set (so the conflict check can't mistake our own
          // save for a foreign one) and in the react-query cache, which is only
          // refetched every 10s and would otherwise keep serving the revision we
          // just replaced.
          rememberRev(schedule._id, schedule._rev)
          const savedId = schedule._id
          const savedRev = schedule._rev
          utils.schedule.admin.pollVersions.setData(undefined, (prev) => {
            if (!prev || !savedRev) return prev
            return prev.some((v) => v._id === savedId)
              ? prev.map((v) =>
                  v._id === savedId ? { ...v, _rev: savedRev } : v,
                )
              : [...prev, { _id: savedId, _rev: savedRev, version: 0 }]
          })
        }
      }

      dispatch({ type: 'saveEnd' })
      setSaveSuccess(true)
      saveSuccessTimeoutRef.current = setTimeout(() => {
        setSaveSuccess(false)
        saveSuccessTimeoutRef.current = null
      }, 3000)
    } catch (err) {
      // A CONFLICT means another organizer changed this day since it was loaded.
      // Don't clobber the user's in-progress edits — stop and tell them to
      // reload. Any other error keeps its original message.
      const code = (err as { data?: { code?: string } })?.data?.code
      const message =
        code === 'CONFLICT'
          ? 'This day was changed elsewhere — reload to get the latest before saving. Autosave is paused.'
          : `${
              err instanceof Error ? err.message : 'Failed to save schedule'
            } — autosave is paused, your changes are kept locally. Press Save to retry.`
      // Park autosave on THIS exact payload. The failure modes here are
      // persistent (a server-side double-booking the client check missed, a
      // revision conflict), so re-arming every 3s just replayed the same
      // rejected save forever. The edits stay in state and stay dirty.
      setFailedSaveSnapshot(attemptedSnapshot)
      dispatch({ type: 'saveError', message })
    }
  }, [
    state.dirty,
    state.schedules,
    currentDayIndex,
    saveMutation,
    utils,
    rememberRev,
  ])

  // Auto-save: if there are unsaved changes and we are in draft mode, save
  // automatically after 3 seconds of inactivity. Parked after a failed save
  // until the user edits again (a new `state.schedules` identity clears
  // `autoSaveSuspended`) or presses Save.
  useEffect(() => {
    if (!hasUnsavedChanges || isSaving || !isDraftMode) return
    if (autoSaveSuspended) return

    const timer = setTimeout(() => {
      handleSave()
    }, 3000)

    return () => clearTimeout(timer)
  }, [hasUnsavedChanges, isSaving, isDraftMode, autoSaveSuspended, handleSave])

  // Switching view mode recomputes `mergedSchedules`, which makes the effect
  // above dispatch `resetSchedules` — that DISCARDS every dirty day. It used to
  // happen silently on a single toggle click, so ask first. (Autosave normally
  // keeps `hasUnsavedChanges` false; it is true exactly when a save failed or is
  // still pending — i.e. precisely the work that would be lost.)
  const handleToggleDraftMode = useCallback(
    (next: boolean) => {
      if (next === isDraftMode) return
      if (
        hasUnsavedChanges &&
        !window.confirm(
          'You have unsaved changes. Switching view reloads the schedule from the server and discards them. Switch anyway?',
        )
      ) {
        return
      }
      setIsDraftMode(next)
    },
    [isDraftMode, hasUnsavedChanges],
  )

  const handlePromote = useCallback(async () => {
    if (!currentSchedule?._id) return
    if (!confirm('Are you sure you want to publish this day?')) return

    try {
      await actionMutation.mutateAsync({
        id: currentSchedule._id,
        action: 'promote',
      })
      alert('Day published successfully!')
      // Optionally reload the page to get the freshest data, or just let the cache revalidate.
      window.location.reload()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to publish schedule'
      alert(`Error publishing: ${message}`)
    }
  }, [currentSchedule, actionMutation])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    setActiveItem(active.data.current as DragItem)
  }, [])

  // An Escape-cancelled drag must clear the active item too, or the board is
  // left thinking a drag is still in flight (every "+ Service" button hidden,
  // stale canDrop indicators) until the next successful drag.
  const handleDragCancel = useCallback(() => {
    setActiveItem(null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || !active.data.current) {
        setActiveItem(null)
        return
      }

      const dragItem = active.data.current as DragItem
      const dropData = over.data.current

      if (dropData?.type === 'time-slot') {
        const dropPosition = {
          trackIndex: dropData.trackIndex,
          timeSlot: dropData.timeSlot,
        }
        if (dragItem.proposal) {
          editDispatch({ type: 'moveProposal', dragItem, dropPosition })
        } else if (dragItem.serviceSession) {
          editDispatch({ type: 'moveService', dragItem, dropPosition })
        }
      }

      setActiveItem(null)
    },
    [editDispatch],
  )

  const handleAddTrack = useCallback(
    (trackData: { title: string; description: string }) => {
      const newTrack: ScheduleTrack = {
        trackTitle: trackData.title,
        trackDescription: trackData.description,
        talks: [],
      }
      editDispatch({ type: 'addTrack', track: newTrack })
      setShowAddTrackModal(false)
    },
    [editDispatch],
  )

  const handleShowAddTrackModal = useCallback(() => {
    if (isReadOnly) return
    setShowAddTrackModal(true)
  }, [isReadOnly])

  const handleHideAddTrackModal = useCallback(() => {
    setShowAddTrackModal(false)
  }, [])

  const handleDayChange = useCallback((dayIndex: number) => {
    dispatch({ type: 'changeDay', dayIndex })
    setSaveSuccess(false)
  }, [])

  const handleUpdateTrack = useCallback(
    (index: number, track: ScheduleTrack) => {
      editDispatch({ type: 'updateTrack', trackIndex: index, track })
    },
    [editDispatch],
  )

  const handleRemoveTrack = useCallback(
    (index: number) => {
      editDispatch({ type: 'removeTrack', trackIndex: index })
    },
    [editDispatch],
  )

  const handleRemoveTalk = useCallback(
    (trackIndex: number, talkIndex: number) => {
      editDispatch({ type: 'removeTalk', trackIndex, talkIndex })
    },
    [editDispatch],
  )

  const handleAddServiceSession = useCallback(
    (
      trackIndex: number,
      startTime: string,
      title: string,
      duration: number,
    ) => {
      editDispatch({
        type: 'addService',
        trackIndex,
        startTime,
        title,
        duration,
      })
    },
    [editDispatch],
  )

  const handleResizeServiceSession = useCallback(
    (trackIndex: number, talkIndex: number, duration: number) => {
      editDispatch({
        type: 'resizeItem',
        trackIndex,
        talkIndex,
        duration,
      })
    },
    [editDispatch],
  )

  const handleRenameServiceSession = useCallback(
    (trackIndex: number, talkIndex: number, title: string) => {
      editDispatch({ type: 'renameService', trackIndex, talkIndex, title })
    },
    [editDispatch],
  )

  const schedule = currentSchedule

  const handleDuplicateServiceSession = useCallback(
    (serviceSession: TrackTalk, sourceTrackIndex: number) => {
      editDispatch({
        type: 'duplicateService',
        serviceSession,
        sourceTrackIndex,
      })
    },
    [editDispatch],
  )

  const hasTracks = Boolean(schedule?.tracks && schedule.tracks.length > 0)

  // Ids scheduled on OTHER days — the cross-day duplicate set the reducer feeds
  // `moveProposal`. Threading it through context lets `canDrop` apply the exact
  // same guard so the indicator can't promise a drop the reducer rejects.
  const otherScheduledProposalIds = useMemo(
    () => scheduledProposalIdsExcludingDay(state.schedules, currentDayIndex),
    [state.schedules, currentDayIndex],
  )

  const filteredProposalIds = useMemo(
    () => new Set(filters.filteredProposals.map((p) => p._id)),
    [filters.filteredProposals],
  )
  const isFilteredOut = useCallback(
    (id: string) => !filteredProposalIds.has(id),
    [filteredProposalIds],
  )

  // Ambient board state for the leaf drop targets (see ScheduleContext): the
  // active drag, the whole current day (for the swap reverse-check), the
  // cross-day duplicate set, the read-only flag, the gated dispatch, and
  // whether a card is currently filtered out.
  const scheduleContextValue = useMemo(
    () => ({
      activeDragItem: activeItem,
      schedule: currentSchedule,
      otherScheduledProposalIds,
      isReadOnly,
      dispatch: editDispatch,
      isFilteredOut,
    }),
    [
      activeItem,
      currentSchedule,
      otherScheduledProposalIds,
      isReadOnly,
      editDispatch,
      isFilteredOut,
    ],
  )

  const dragOverlay = useMemo(() => {
    if (!activeItem) return null

    if (activeItem.proposal) {
      return <DraggableProposal proposal={activeItem.proposal} isDragging />
    } else if (activeItem.serviceSession) {
      return (
        <DraggableServiceSession
          serviceSession={activeItem.serviceSession}
          isDragging
        />
      )
    }

    return null
  }, [activeItem])

  // Explicit sensors so touch drag coexists with scrolling. Without any sensors
  // dnd-kit's default PointerSensor has NO activation constraint, so on a phone
  // the first move of a scroll swipe starts a drag and the board/list can't be
  // scrolled. Mouse drags stay instant (tiny distance); touch requires a short
  // press-and-hold (delay) so a quick swipe scrolls instead of dragging.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  )

  // No days means no conference dates (see NoConferenceDatesState). Bail BEFORE
  // either layout so neither the desktop board nor the mobile view can offer an
  // edit that has nowhere to land. Every hook above has already run.
  if (state.schedules.length === 0) {
    return <NoConferenceDatesState />
  }

  if (!isDesktop) {
    return (
      <>
        <MobileScheduleView
          schedules={state.schedules}
          currentDayIndex={currentDayIndex}
          unassignedProposals={unassignedProposals}
          // The gated dispatch, so live mode is inert on mobile too.
          dispatch={editDispatch}
          onDayChange={handleDayChange}
          onSave={handleSave}
          onAddTrack={handleShowAddTrackModal}
          isSaving={isSaving}
          saveSuccess={saveSuccess}
          hasUnsavedChanges={hasUnsavedChanges}
          error={error}
          // Draft/live is not a desktop-only concept: without these a mobile
          // organizer edited (and saved) a DRAFT with nothing on screen saying
          // so, and no way to publish it.
          isDraftMode={isDraftMode}
          onToggleDraftMode={handleToggleDraftMode}
          onPromote={handlePromote}
        />
        {showAddTrackModal && (
          <AddTrackModal
            onAdd={handleAddTrack}
            onCancel={handleHideAddTrackModal}
          />
        )}
      </>
    )
  }

  return (
    <div className={LAYOUT_CLASSES.container}>
      <ScheduleProvider value={scheduleContextValue}>
        <DndContext
          id={dndId}
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          collisionDetection={pointerWithin}
        >
          <UnassignedProposals
            proposals={unassignedProposals}
            filters={filters}
          />

          <div className={LAYOUT_CLASSES.mainArea}>
            <HeaderSection
              schedule={currentSchedule}
              schedules={state.schedules}
              currentDayIndex={currentDayIndex}
              onDayChange={handleDayChange}
              onAddTrack={handleShowAddTrackModal}
              onSave={handleSave}
              isSaving={isSaving}
              saveSuccess={saveSuccess}
              hasUnsavedChanges={hasUnsavedChanges}
              isDraftMode={isDraftMode}
              onToggleDraftMode={handleToggleDraftMode}
              onPromote={handlePromote}
            />

            {error && (
              <ErrorBanner
                error={error}
                isRefreshing={isRefreshing}
                onRefresh={
                  error.includes('reload') ? handleRefreshData : undefined
                }
              />
            )}

            <div className={LAYOUT_CLASSES.content}>
              {hasTracks ? (
                <MemoizedTracksGrid
                  tracks={schedule!.tracks!}
                  onUpdateTrack={handleUpdateTrack}
                  onRemoveTrack={handleRemoveTrack}
                  onRemoveTalk={handleRemoveTalk}
                  onDuplicateServiceSession={handleDuplicateServiceSession}
                  onAddServiceSession={handleAddServiceSession}
                  onResizeServiceSession={handleResizeServiceSession}
                  onRenameServiceSession={handleRenameServiceSession}
                />
              ) : (
                <EmptyState
                  onAddTrack={handleShowAddTrackModal}
                  isReadOnly={isReadOnly}
                />
              )}
            </div>
          </div>

          {/* dropAnimation={null}: on a successful drop the source card unmounts
              (the talk moves to its new slot / leaves the sidebar), so dnd-kit's
              default animation of the overlay BACK to the origin rect reads as a
              snap-back/"didn't take" even though the move succeeded. */}
          <DragOverlay dropAnimation={null}>{dragOverlay}</DragOverlay>
        </DndContext>
      </ScheduleProvider>

      {showAddTrackModal && (
        <AddTrackModal
          onAdd={handleAddTrack}
          onCancel={handleHideAddTrackModal}
        />
      )}
    </div>
  )
}
