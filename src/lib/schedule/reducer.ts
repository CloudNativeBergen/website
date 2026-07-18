import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { DragItem, DropPosition, EditorSchedule } from './types'
import * as ops from './operations'

/**
 * Single source of truth for the schedule editor: ALL days live in `schedules`
 * simultaneously and the active day is identified by `currentDayIndex` (an
 * index, never an `_id`). This replaces the old dual store — `modifiedSchedules`
 * (all days) hand-synced with a hook holding only the current day — and its two
 * fragile sync effects.
 *
 * Why index, not `_id`: unsaved days all carry `_id: ''`, so keying the active
 * day on `_id` made two unsaved days collide (switching kept the wrong day
 * loaded and the next edit wrote onto the wrong day). Indexing on
 * `currentDayIndex` keeps every day independent.
 *
 * `dirty[i]` marks day `i` as changed since its last save, so save can persist
 * EVERY edited day (not just the current one — the old per-day-save bug dropped
 * edits made on other days). `unassignedProposals` is DERIVED via
 * `ops.computeUnassigned`, never stored.
 */
export interface ScheduleEditorState {
  schedules: EditorSchedule[]
  currentDayIndex: number
  proposals: ProposalExisting[]
  dirty: boolean[]
  ui: {
    isSaving: boolean
    error: string | null
  }
}

export type ScheduleAction =
  | { type: 'moveProposal'; dragItem: DragItem; dropPosition: DropPosition }
  | { type: 'moveService'; dragItem: DragItem; dropPosition: DropPosition }
  | { type: 'addTrack'; track: ScheduleTrack }
  | { type: 'removeTrack'; trackIndex: number }
  | { type: 'updateTrack'; trackIndex: number; track: ScheduleTrack }
  | { type: 'removeTalk'; trackIndex: number; talkIndex: number }
  | {
      type: 'addService'
      trackIndex: number
      title: string
      startTime: string
      duration: number
    }
  | {
      type: 'resizeService'
      trackIndex: number
      talkIndex: number
      duration: number
    }
  | {
      type: 'renameService'
      trackIndex: number
      talkIndex: number
      title: string
    }
  | {
      type: 'duplicateService'
      serviceSession: TrackTalk
      sourceTrackIndex: number
    }
  | { type: 'changeDay'; dayIndex: number }
  | { type: 'saveStart' }
  | {
      type: 'saveDaySucceeded'
      index: number
      _id: string
      _rev?: string
      // The EXACT day object that was sent to the server for this save. Every
      // reducer edit REPLACES the day object, so an identity compare against the
      // current `schedules[index]` tells us whether an edit landed while the save
      // was in flight (see the case handler for the lost-update guard).
      saved: EditorSchedule
    }
  | { type: 'saveError'; message: string }
  | { type: 'saveEnd' }

export function initScheduleEditorState(args: {
  schedules: EditorSchedule[]
  proposals: ProposalExisting[]
}): ScheduleEditorState {
  return {
    schedules: args.schedules,
    currentDayIndex: 0,
    proposals: args.proposals,
    dirty: args.schedules.map(() => false),
    ui: { isSaving: false, error: null },
  }
}

/**
 * Apply a day-level transform result to the current day: on success, replace
 * `schedules[currentDayIndex]` and mark it dirty; on failure, return state
 * unchanged (an invalid drop must not touch state or dirty tracking).
 */
function withDayResult(
  state: ScheduleEditorState,
  result: ops.OperationResult,
): ScheduleEditorState {
  if (!result.ok) return state
  const schedules = [...state.schedules]
  schedules[state.currentDayIndex] = result.schedule
  const dirty = [...state.dirty]
  dirty[state.currentDayIndex] = true
  return { ...state, schedules, dirty }
}

export function scheduleReducer(
  state: ScheduleEditorState,
  action: ScheduleAction,
): ScheduleEditorState {
  const current = state.schedules[state.currentDayIndex]

  switch (action.type) {
    case 'moveProposal': {
      if (!current) return state
      const otherIds = ops.scheduledProposalIdsExcludingDay(
        state.schedules,
        state.currentDayIndex,
      )
      return withDayResult(
        state,
        ops.moveProposal(
          current,
          action.dragItem,
          action.dropPosition,
          otherIds,
        ),
      )
    }

    case 'moveService': {
      if (!current) return state
      return withDayResult(
        state,
        ops.moveServiceSession(current, action.dragItem, action.dropPosition),
      )
    }

    case 'addTrack': {
      if (!current) return state
      return withDayResult(state, ops.addTrack(current, action.track))
    }

    case 'removeTrack': {
      if (!current) return state
      return withDayResult(state, ops.removeTrack(current, action.trackIndex))
    }

    case 'updateTrack': {
      if (!current) return state
      return withDayResult(
        state,
        ops.updateTrack(current, action.trackIndex, action.track),
      )
    }

    case 'removeTalk': {
      if (!current) return state
      return withDayResult(
        state,
        ops.removeTalk(current, action.trackIndex, action.talkIndex),
      )
    }

    case 'addService': {
      if (!current) return state
      return withDayResult(
        state,
        ops.addService(current, action.trackIndex, {
          title: action.title,
          startTime: action.startTime,
          duration: action.duration,
        }),
      )
    }

    case 'resizeService': {
      if (!current) return state
      return withDayResult(
        state,
        ops.resizeService(
          current,
          action.trackIndex,
          action.talkIndex,
          action.duration,
        ),
      )
    }

    case 'renameService': {
      if (!current) return state
      return withDayResult(
        state,
        ops.renameService(
          current,
          action.trackIndex,
          action.talkIndex,
          action.title,
        ),
      )
    }

    case 'duplicateService': {
      if (!current) return state
      return withDayResult(
        state,
        ops.duplicateService(
          current,
          action.serviceSession,
          action.sourceTrackIndex,
        ),
      )
    }

    case 'changeDay': {
      if (action.dayIndex < 0 || action.dayIndex >= state.schedules.length) {
        return state
      }
      return {
        ...state,
        currentDayIndex: action.dayIndex,
        ui: { ...state.ui, error: null },
      }
    }

    case 'saveStart':
      return { ...state, ui: { isSaving: true, error: null } }

    case 'saveDaySucceeded': {
      if (action.index < 0 || action.index >= state.schedules.length) {
        return state
      }
      const schedules = [...state.schedules]
      const currentDay = schedules[action.index]
      // The document really advanced on the server, so ALWAYS thread the new
      // `_id`/`_rev` — even when an edit landed mid-save. Keeping a stale `_rev`
      // would make the NEXT save a false `ifRevisionId` conflict; carrying the
      // fresh one lets that save re-send the newer state and actually persist it.
      schedules[action.index] = {
        ...currentDay,
        _id: action._id,
        _rev: action._rev ?? currentDay._rev,
      }
      const dirty = [...state.dirty]
      // LOST-UPDATE GUARD: clear `dirty[index]` ONLY if nothing changed since the
      // snapshot we sent. Every edit replaces the day object, so identity still
      // matching (`currentDay === action.saved`) means no interleaved edit — the
      // save covered the current state. If they differ, an edit landed while the
      // save was in flight; keep the day dirty so the next save re-sends it.
      if (currentDay === action.saved) {
        dirty[action.index] = false
      }
      return { ...state, schedules, dirty }
    }

    case 'saveError':
      return { ...state, ui: { isSaving: false, error: action.message } }

    case 'saveEnd':
      return { ...state, ui: { ...state.ui, isSaving: false } }

    default:
      return state
  }
}
