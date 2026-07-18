/**
 * @vitest-environment node
 *
 * Tests for the schedule editor reducer (src/lib/schedule/reducer.ts). The
 * reducer owns ALL days and keys the active day on `currentDayIndex`, which is
 * what fixes the two data-loss bugs this suite guards:
 *   1. DAY-COLLISION: two unsaved days (both `_id: ''`) must stay independent
 *      when switching between them — the old `_id`-keyed sync loaded the wrong
 *      day and a subsequent edit overwrote it.
 *   2. PER-DAY SAVE: every DIRTY day is tracked so save can persist each one;
 *      the old code only saved the current day and dropped the rest.
 */
import { describe, it, expect } from 'vitest'
import type { TrackTalk } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type {
  DragItem,
  Slot,
  EditorTrack,
  EditorSchedule,
} from '@/lib/schedule/types'
import {
  scheduleReducer,
  initScheduleEditorState,
  type ScheduleEditorState,
} from '@/lib/schedule/reducer'

const proposal = (id: string, format = 'talk_25'): ProposalExisting =>
  ({ _id: id, format }) as unknown as ProposalExisting

const talk = (id: string, start: string, end: string): Slot => ({
  kind: 'talk',
  talk: proposal(id),
  startTime: start,
  endTime: end,
})

const track = (title: string, ...talks: Slot[]): EditorTrack => ({
  trackTitle: title,
  trackDescription: '',
  talks,
})

const unsavedDay = (
  date: string,
  ...tracks: EditorTrack[]
): EditorSchedule => ({
  _id: '',
  date,
  tracks,
})

const freshDrop = (id: string): DragItem => ({
  type: 'proposal',
  proposal: proposal(id),
})

describe('initScheduleEditorState', () => {
  it('starts on day 0 with all days clean and no save in flight', () => {
    const state = initScheduleEditorState({
      schedules: [unsavedDay('d1'), unsavedDay('d2')],
      proposals: [proposal('a')],
    })
    expect(state.currentDayIndex).toBe(0)
    expect(state.dirty).toEqual([false, false])
    expect(state.ui).toEqual({ isSaving: false, error: null })
  })
})

describe('day mutations mark the current day dirty', () => {
  const base = (): ScheduleEditorState =>
    initScheduleEditorState({
      schedules: [unsavedDay('d1', track('A'))],
      proposals: [proposal('a')],
    })

  it('moveProposal updates schedules[current] and sets dirty', () => {
    const next = scheduleReducer(base(), {
      type: 'moveProposal',
      dragItem: freshDrop('a'),
      dropPosition: { trackIndex: 0, timeSlot: '10:00' },
    })
    expect(next.schedules[0].tracks[0].talks[0].talk?._id).toBe('a')
    expect(next.dirty[0]).toBe(true)
  })

  it('an invalid move leaves state (and dirty) untouched', () => {
    const start = base()
    const next = scheduleReducer(start, {
      type: 'moveProposal',
      dragItem: freshDrop('a'),
      dropPosition: { trackIndex: 9, timeSlot: '10:00' }, // out of range
    })
    expect(next).toBe(start)
    expect(next.dirty[0]).toBe(false)
  })

  it('addTrack / updateTrack / removeTrack mark dirty', () => {
    let state = base()
    state = scheduleReducer(state, { type: 'addTrack', track: track('B') })
    expect(state.schedules[0].tracks).toHaveLength(2)
    expect(state.dirty[0]).toBe(true)

    state = scheduleReducer(state, {
      type: 'updateTrack',
      trackIndex: 1,
      track: track('B2'),
    })
    expect(state.schedules[0].tracks[1].trackTitle).toBe('B2')

    state = scheduleReducer(state, { type: 'removeTrack', trackIndex: 0 })
    expect(state.schedules[0].tracks.map((t) => t.trackTitle)).toEqual(['B2'])
  })

  it('duplicateService skips conflicting tracks via the reducer', () => {
    const state = initScheduleEditorState({
      schedules: [
        unsavedDay(
          'd1',
          track('Source'),
          track('Free'),
          track('Busy', talk('x', '10:10', '10:40')),
        ),
      ],
      proposals: [],
    })
    const session: TrackTalk = {
      placeholder: 'Break',
      startTime: '10:00',
      endTime: '10:15',
    }
    const next = scheduleReducer(state, {
      type: 'duplicateService',
      serviceSession: session,
      sourceTrackIndex: 0,
    })
    expect(next.schedules[0].tracks[1].talks[0].placeholder).toBe('Break')
    expect(next.schedules[0].tracks[2].talks).toHaveLength(1) // busy untouched
    expect(next.dirty[0]).toBe(true)
  })
})

describe('changeDay — day-collision regression (two unsaved days)', () => {
  it('keeps two unsaved days independent across switches', () => {
    // Both days carry _id: '' — the exact case that used to collide.
    let state = initScheduleEditorState({
      schedules: [unsavedDay('d1', track('A')), unsavedDay('d2', track('B'))],
      proposals: [proposal('a'), proposal('b')],
    })

    // Edit day 0.
    state = scheduleReducer(state, {
      type: 'moveProposal',
      dragItem: freshDrop('a'),
      dropPosition: { trackIndex: 0, timeSlot: '10:00' },
    })

    // Switch to day 1 and edit it.
    state = scheduleReducer(state, { type: 'changeDay', dayIndex: 1 })
    expect(state.currentDayIndex).toBe(1)
    state = scheduleReducer(state, {
      type: 'moveProposal',
      dragItem: freshDrop('b'),
      dropPosition: { trackIndex: 0, timeSlot: '11:00' },
    })

    // Switch back to day 0.
    state = scheduleReducer(state, { type: 'changeDay', dayIndex: 0 })

    // Each day retains ONLY its own content.
    expect(state.schedules[0].tracks[0].talks.map((t) => t.talk?._id)).toEqual([
      'a',
    ])
    expect(state.schedules[1].tracks[0].talks.map((t) => t.talk?._id)).toEqual([
      'b',
    ])
    expect(state.dirty).toEqual([true, true])
  })

  it('rejects placing a proposal already scheduled on another day', () => {
    let state = initScheduleEditorState({
      schedules: [
        unsavedDay('d1', track('A', talk('a', '10:00', '10:25'))),
        unsavedDay('d2', track('B')),
      ],
      proposals: [proposal('a')],
    })
    state = scheduleReducer(state, { type: 'changeDay', dayIndex: 1 })
    const next = scheduleReducer(state, {
      type: 'moveProposal',
      dragItem: freshDrop('a'), // already on day 0
      dropPosition: { trackIndex: 0, timeSlot: '11:00' },
    })
    expect(next.schedules[1].tracks[0].talks).toHaveLength(0)
    expect(next.dirty[1]).toBe(false)
  })

  it('ignores an out-of-range day index', () => {
    const start = initScheduleEditorState({
      schedules: [unsavedDay('d1')],
      proposals: [],
    })
    expect(scheduleReducer(start, { type: 'changeDay', dayIndex: 5 })).toBe(
      start,
    )
  })
})

describe('save lifecycle + dirty tracking', () => {
  const twoDirtyDays = (): ScheduleEditorState => {
    let state = initScheduleEditorState({
      schedules: [unsavedDay('d1', track('A')), unsavedDay('d2', track('B'))],
      proposals: [proposal('a'), proposal('b')],
    })
    state = scheduleReducer(state, {
      type: 'moveProposal',
      dragItem: freshDrop('a'),
      dropPosition: { trackIndex: 0, timeSlot: '10:00' },
    })
    state = scheduleReducer(state, { type: 'changeDay', dayIndex: 1 })
    state = scheduleReducer(state, {
      type: 'moveProposal',
      dragItem: freshDrop('b'),
      dropPosition: { trackIndex: 0, timeSlot: '10:00' },
    })
    return state
  }

  it('tracks both edited days as dirty (drives per-day save)', () => {
    expect(twoDirtyDays().dirty).toEqual([true, true])
  })

  it('saveStart sets isSaving and clears any error', () => {
    const next = scheduleReducer(twoDirtyDays(), { type: 'saveStart' })
    expect(next.ui).toEqual({ isSaving: true, error: null })
  })

  it('saveDaySucceeded stamps the _id and clears that day dirty only', () => {
    let state = scheduleReducer(twoDirtyDays(), { type: 'saveStart' })
    state = scheduleReducer(state, {
      type: 'saveDaySucceeded',
      index: 0,
      _id: 'server-id-0',
      saved: state.schedules[0],
    })
    expect(state.schedules[0]._id).toBe('server-id-0')
    expect(state.dirty).toEqual([false, true])

    state = scheduleReducer(state, {
      type: 'saveDaySucceeded',
      index: 1,
      _id: 'server-id-1',
      saved: state.schedules[1],
    })
    expect(state.schedules[1]._id).toBe('server-id-1')
    expect(state.dirty).toEqual([false, false])

    state = scheduleReducer(state, { type: 'saveEnd' })
    expect(state.ui.isSaving).toBe(false)
  })

  it('saveDaySucceeded stores the new _rev for optimistic concurrency', () => {
    let state = scheduleReducer(twoDirtyDays(), { type: 'saveStart' })
    state = scheduleReducer(state, {
      type: 'saveDaySucceeded',
      index: 0,
      _id: 'server-id-0',
      _rev: 'rev-abc',
      saved: state.schedules[0],
    })
    expect(state.schedules[0]._rev).toBe('rev-abc')

    // A save that returns no _rev keeps whatever revision was already stored
    // (rather than wiping it to undefined and forcing an unconditional write).
    state = scheduleReducer(state, {
      type: 'saveDaySucceeded',
      index: 0,
      _id: 'server-id-0',
      saved: state.schedules[0],
    })
    expect(state.schedules[0]._rev).toBe('rev-abc')
  })

  // F1 — LOST-UPDATE RACE. `handleSave` captures a snapshot of the day and sends
  // it; when the response lands, the reducer must clear `dirty` only if that
  // exact snapshot is still the current day. An edit made while the save was in
  // flight replaces the day object, so identity no longer matches and the day
  // must stay dirty (its newer edits weren't part of the save).
  describe('saveDaySucceeded — lost-update guard (F1)', () => {
    it('clears dirty when no edit landed between saveStart and success', () => {
      let state = scheduleReducer(twoDirtyDays(), { type: 'saveStart' })
      // The snapshot handleSave would have sent is the current day object.
      const snapshot = state.schedules[0]
      state = scheduleReducer(state, {
        type: 'saveDaySucceeded',
        index: 0,
        _id: 'server-id-0',
        _rev: 'rev-1',
        saved: snapshot,
      })
      expect(state.dirty[0]).toBe(false)
      expect(state.schedules[0]._id).toBe('server-id-0')
      expect(state.schedules[0]._rev).toBe('rev-1')
    })

    it('keeps the day dirty (and still updates _rev) when an edit lands mid-save', () => {
      // saveStart captures the snapshot handleSave sends to the server.
      let state = scheduleReducer(twoDirtyDays(), { type: 'saveStart' })
      const snapshot = state.schedules[0]

      // An edit lands on day 0 WHILE the save is in flight — switch to day 0 and
      // edit it; the reducer replaces the day object, so it is no longer
      // identical to the snapshot the save sent.
      state = scheduleReducer(state, { type: 'changeDay', dayIndex: 0 })
      state = scheduleReducer(state, { type: 'addTrack', track: track('C') })
      expect(state.schedules[0]).not.toBe(snapshot)
      const interleaved = state.schedules[0]

      // The (now stale) save response lands.
      state = scheduleReducer(state, {
        type: 'saveDaySucceeded',
        index: 0,
        _id: 'server-id-0',
        _rev: 'rev-2',
        saved: snapshot,
      })

      // Dirty STAYS true: the interleaved edit was not part of this save.
      expect(state.dirty[0]).toBe(true)
      // But the doc really advanced, so the new _rev is threaded in — otherwise
      // the next save would be a false conflict.
      expect(state.schedules[0]._rev).toBe('rev-2')
      expect(state.schedules[0]._id).toBe('server-id-0')
      // The interleaved edit's content is preserved (only _id/_rev changed).
      expect(state.schedules[0].tracks).toBe(interleaved.tracks)
    })

    it('the next save then persists the newer state (fresh _rev, still dirty)', () => {
      let state = scheduleReducer(twoDirtyDays(), { type: 'saveStart' })
      const snapshot = state.schedules[0]
      // Interleaved edit on day 0.
      state = scheduleReducer(state, { type: 'changeDay', dayIndex: 0 })
      state = scheduleReducer(state, { type: 'addTrack', track: track('C') })
      // Stale response lands: day stays dirty, _rev advances to rev-2.
      state = scheduleReducer(state, {
        type: 'saveDaySucceeded',
        index: 0,
        _id: 'server-id-0',
        _rev: 'rev-2',
        saved: snapshot,
      })

      // The next save sends the CURRENT (newer) day carrying the fresh _rev, so it
      // doesn't false-conflict — model it as a second saveStart + success whose
      // snapshot is the current day.
      const nextSnapshot = state.schedules[0]
      expect(nextSnapshot._rev).toBe('rev-2')
      state = scheduleReducer(state, { type: 'saveStart' })
      state = scheduleReducer(state, {
        type: 'saveDaySucceeded',
        index: 0,
        _id: 'server-id-0',
        _rev: 'rev-3',
        saved: nextSnapshot,
      })
      // No further edit interleaved this time, so the newer state is now clean.
      expect(state.dirty[0]).toBe(false)
      expect(state.schedules[0]._rev).toBe('rev-3')
    })
  })

  it('saveError records the message and stops saving', () => {
    let state = scheduleReducer(twoDirtyDays(), { type: 'saveStart' })
    state = scheduleReducer(state, { type: 'saveError', message: 'boom' })
    expect(state.ui).toEqual({ isSaving: false, error: 'boom' })
    // dirty is preserved so a retry still knows what to save
    expect(state.dirty).toEqual([true, true])
  })
})
