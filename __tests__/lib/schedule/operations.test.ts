/**
 * @vitest-environment node
 *
 * Unit tests for the pure schedule transforms (src/lib/schedule/operations.ts).
 * These are the reducer's core, lifted from the old useScheduleEditor mutators.
 * They pin behaviour-preserving move/swap/track semantics plus the two fixes
 * carried into this module:
 *   - duplicateService SKIPS tracks where the session would overlap,
 *   - moveProposal's duplicate guard considers OTHER days (cross-day dedup).
 */
import { describe, it, expect } from 'vitest'
import type { ProposalExisting } from '@/lib/proposal/types'
import type {
  DragItem,
  DropPosition,
  Slot,
  EditorTrack,
  EditorSchedule,
} from '@/lib/schedule/types'
import {
  moveProposal,
  moveServiceSession,
  classifyProposalDrop,
  classifyServiceDrop,
  scheduledProposalIdsExcludingDay,
  addTrack,
  removeTrack,
  updateTrack,
  removeTalk,
  addService,
  resizeService,
  renameService,
  duplicateService,
  computeUnassigned,
} from '@/lib/schedule/operations'

const proposal = (id: string, format = 'talk_25'): ProposalExisting =>
  ({ _id: id, format }) as unknown as ProposalExisting

const talk = (id: string, start: string, end: string): Slot => ({
  kind: 'talk',
  talk: proposal(id),
  startTime: start,
  endTime: end,
})

const service = (name: string, start: string, end: string): Slot => ({
  kind: 'service',
  placeholder: name,
  startTime: start,
  endTime: end,
})

const track = (title: string, ...talks: Slot[]): EditorTrack => ({
  trackTitle: title,
  trackDescription: '',
  talks,
})

const schedule = (...tracks: EditorTrack[]): EditorSchedule => ({
  _id: '',
  date: '2025-09-18',
  tracks,
})

const drop = (trackIndex: number, timeSlot: string): DropPosition => ({
  trackIndex,
  timeSlot,
})

describe('moveProposal — fresh drops', () => {
  it('places a proposal into a free slot and sorts talks', () => {
    const s = schedule(track('A', talk('x', '11:00', '11:25')))
    const dragItem: DragItem = { type: 'proposal', proposal: proposal('p') }
    const res = moveProposal(s, dragItem, drop(0, '10:00'))

    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks.map((t) => t.talk?._id)).toEqual([
      'p',
      'x',
    ])
    const placed = res.schedule.tracks[0].talks[0]
    expect(placed.startTime).toBe('10:00')
    expect(placed.endTime).toBe('10:25')
    // original untouched (pure)
    expect(s.tracks[0].talks).toHaveLength(1)
  })

  it('rejects a duplicate already scheduled on the SAME day', () => {
    const s = schedule(track('A', talk('p', '09:00', '09:25')))
    const dragItem: DragItem = { type: 'proposal', proposal: proposal('p') }
    const res = moveProposal(s, dragItem, drop(0, '10:00'))
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
  })

  it('rejects a duplicate scheduled on ANOTHER day (cross-day guard)', () => {
    const s = schedule(track('A'))
    const dragItem: DragItem = { type: 'proposal', proposal: proposal('p') }
    const res = moveProposal(s, dragItem, drop(0, '10:00'), new Set(['p']))
    expect(res.ok).toBe(false)
  })

  it('rejects a drop onto an occupied slot (no swap for a fresh proposal)', () => {
    const s = schedule(track('A', talk('x', '10:00', '10:25')))
    const dragItem: DragItem = { type: 'proposal', proposal: proposal('p') }
    const res = moveProposal(s, dragItem, drop(0, '10:00'))
    expect(res.ok).toBe(false)
  })

  it('rejects an out-of-range track index', () => {
    const s = schedule(track('A'))
    const dragItem: DragItem = { type: 'proposal', proposal: proposal('p') }
    expect(moveProposal(s, dragItem, drop(5, '10:00')).ok).toBe(false)
  })

  it('rejects a drop that would straddle a service session', () => {
    const s = schedule(track('A', service('Lunch', '11:30', '12:30')))
    const dragItem: DragItem = { type: 'proposal', proposal: proposal('p') }
    // talk_25 at 12:00 → 12:25 overlaps 11:30–12:30 lunch
    expect(moveProposal(s, dragItem, drop(0, '12:00')).ok).toBe(false)
  })
})

describe('moveProposal — moving an already-scheduled talk', () => {
  it('moves a talk to another track and clears the source', () => {
    const s = schedule(track('A', talk('a', '10:00', '10:25')), track('B'))
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '10:00',
    }
    const res = moveProposal(s, dragItem, drop(1, '11:00'))
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks).toHaveLength(0)
    expect(res.schedule.tracks[1].talks[0].talk?._id).toBe('a')
    expect(res.schedule.tracks[1].talks[0].startTime).toBe('11:00')
  })

  it('treats a move onto the talk OWN slot as a no-op (no duplication)', () => {
    // Regression: without the same-position guard this falls into the swap
    // branch (the "occupied" talk is the dragged talk itself) and performSwap
    // re-adds it at both target and source, silently duplicating it. Reachable
    // from the mobile Move sheet, which can default the start to the current slot.
    const s = schedule(track('A', talk('a', '10:00', '10:25')))
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '10:00',
    }
    const res = moveProposal(s, dragItem, drop(0, '10:00'))
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
    expect(res.schedule.tracks[0].talks).toHaveLength(1)
  })
})

describe('moveProposal — swap (bidirectional validation)', () => {
  it('swaps two talks when BOTH directions fit', () => {
    const source = track('A', talk('a', '10:00', '10:20'))
    const target = track('B', talk('b', '10:00', '10:45'))
    const s = schedule(source, target)
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a', 'talk_20'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '10:00',
    }
    const res = moveProposal(s, dragItem, drop(1, '10:00'))
    expect(res.ok).toBe(true)
    // a lands in target at 10:00, b returns to source at 10:00
    expect(res.schedule.tracks[1].talks[0].talk?._id).toBe('a')
    expect(res.schedule.tracks[0].talks[0].talk?._id).toBe('b')
    // endTime is recomputed from b's format duration (talk_25), not the stored
    // endTime — matching the original performSwap behaviour.
    expect(res.schedule.tracks[0].talks[0].startTime).toBe('10:00')
    expect(res.schedule.tracks[0].talks[0].endTime).toBe('10:25')
  })

  it('REJECTS the swap when the displaced talk would overlap the source', () => {
    // Source: a@10:00(20m) leaving, c@10:25(25m) staying.
    const source = track(
      'A',
      talk('a', '10:00', '10:20'),
      talk('c', '10:25', '10:50'),
    )
    // Target: b@10:00 has a 45m FORMAT; forward fits but b back at 10:00→10:45
    // (its format duration, which performSwap writes) hits c.
    const target = track('B', {
      kind: 'talk',
      talk: proposal('b', 'presentation_45'),
      startTime: '10:00',
      endTime: '10:45',
    })
    const s = schedule(source, target)
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a', 'talk_20'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '10:00',
    }
    const res = moveProposal(s, dragItem, drop(1, '10:00'))
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
  })

  it('REJECTS a swap validated with the stored span but applied with the FORMAT duration (F3)', () => {
    // Source: a(talk_25)@11:00–11:25 leaving, c@11:30–11:55 staying.
    const source = track(
      'A',
      talk('a', '11:00', '11:25'),
      talk('c', '11:30', '11:55'),
    )
    // Target b is STORED as a 20-min slot (10:00–10:20) but its format is
    // presentation_45. The old code validated the displaced talk with the stored
    // span (20m → b back at 11:00–11:20, clears c) then performSwap wrote the 45m
    // format duration (11:00–11:45, overlapping c). Check-what-you-write ⇒ REJECT.
    const target = track('B', {
      kind: 'talk',
      talk: proposal('b', 'presentation_45'),
      startTime: '10:00',
      endTime: '10:20',
    })
    const s = schedule(source, target)
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a', 'talk_25'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '11:00',
    }
    expect(classifyProposalDrop(s.tracks, dragItem, drop(1, '10:00'))).toBe(
      'invalid',
    )
    const res = moveProposal(s, dragItem, drop(1, '10:00'))
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
  })

  it('allows a legal SAME-TRACK swap and leaves non-overlapping slots (F6)', () => {
    // One track: a(talk_25)@09:00, b STORED as a 60-min slot 09:30–10:30 but
    // FORMAT talk_25. Pre-fix validated the displaced talk with the stored 60-min
    // span, which self-collided with b's own vacated slot → this legal swap was
    // wrongly rejected. With the FORMAT duration plus the vacated-slot exclusions
    // it succeeds: b→09:00–09:25, a→09:30–09:55, non-overlapping.
    const s = schedule(
      track('A', talk('a', '09:00', '09:25'), {
        kind: 'talk',
        talk: proposal('b', 'talk_25'),
        startTime: '09:30',
        endTime: '10:30',
      }),
    )
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a', 'talk_25'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '09:00',
    }
    expect(classifyProposalDrop(s.tracks, dragItem, drop(0, '09:30'))).toBe(
      'swap',
    )
    const res = moveProposal(s, dragItem, drop(0, '09:30'))
    expect(res.ok).toBe(true)
    const slots = res.schedule.tracks[0].talks
    expect(slots.map((t) => t.talk?._id)).toEqual(['b', 'a'])
    expect(slots[0]).toMatchObject({ startTime: '09:00', endTime: '09:25' })
    expect(slots[1]).toMatchObject({ startTime: '09:30', endTime: '09:55' })
  })

  it('REJECTS a same-track swap whose two talks would overlap EACH OTHER (F6 guard)', () => {
    // a(talk_25)@09:00 dragged onto b(talk_60)@09:30. Each half-check passes in
    // isolation (each ignores the other's vacated slot), but the final
    // a@09:30–09:55 sits inside b@09:00–10:00. The same-track mutual-overlap guard
    // rejects — the vacated-slot exclusions must not approve a self-overlapping swap.
    const s = schedule(
      track('A', talk('a', '09:00', '09:25'), {
        kind: 'talk',
        talk: proposal('b', 'talk_60'),
        startTime: '09:30',
        endTime: '10:30',
      }),
    )
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a', 'talk_25'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '09:00',
    }
    expect(classifyProposalDrop(s.tracks, dragItem, drop(0, '09:30'))).toBe(
      'invalid',
    )
    expect(moveProposal(s, dragItem, drop(0, '09:30')).ok).toBe(false)
  })

  it('REJECTS a same-track swap where the displaced talk lands on a THIRD talk (F6)', () => {
    // Same track: a(talk_25)@09:00, d(talk_25)@09:35 (stays), b(talk_60)@10:30.
    // Dragging a onto b displaces b back to 09:00 for its 60-min format
    // (09:00–10:00), overlapping d@09:35. The reverse half-check (which does NOT
    // exclude d) rejects — a real third-talk collision is not masked.
    const s = schedule(
      track('A', talk('a', '09:00', '09:25'), talk('d', '09:35', '10:00'), {
        kind: 'talk',
        talk: proposal('b', 'talk_60'),
        startTime: '10:30',
        endTime: '11:30',
      }),
    )
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a', 'talk_25'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '09:00',
    }
    expect(classifyProposalDrop(s.tracks, dragItem, drop(0, '10:30'))).toBe(
      'invalid',
    )
    expect(moveProposal(s, dragItem, drop(0, '10:30')).ok).toBe(false)
  })

  it('leaves cross-track swaps unchanged (F6 — same-track guard does not apply)', () => {
    // Regression guard: the same-track-only mutual-overlap check must not affect a
    // legal cross-track swap. a(talk_25)@10:00 in track A ↔ b(talk_25)@11:00 in B.
    const s = schedule(
      track('A', talk('a', '10:00', '10:25')),
      track('B', talk('b', '11:00', '11:25')),
    )
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a', 'talk_25'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '10:00',
    }
    expect(classifyProposalDrop(s.tracks, dragItem, drop(1, '11:00'))).toBe(
      'swap',
    )
    const res = moveProposal(s, dragItem, drop(1, '11:00'))
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[1].talks[0].talk?._id).toBe('a')
    expect(res.schedule.tracks[0].talks[0].talk?._id).toBe('b')
  })
})

describe('moveServiceSession', () => {
  const serviceDrag = (
    placeholder: string,
    start: string,
    end: string,
    source?: { sourceTrackIndex: number; sourceTimeSlot: string },
  ): DragItem => {
    const serviceSession = { placeholder, startTime: start, endTime: end }
    return source
      ? { type: 'scheduled-service', serviceSession, ...source }
      : { type: 'service-session', serviceSession }
  }

  it('places a service session into a free interval', () => {
    const s = schedule(track('A'))
    const res = moveServiceSession(
      s,
      serviceDrag('Lunch', '12:00', '13:00'),
      drop(0, '12:00'),
    )
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks[0].placeholder).toBe('Lunch')
    expect(res.schedule.tracks[0].talks[0].endTime).toBe('13:00')
  })

  it('rejects a service session overlapping an existing item', () => {
    const s = schedule(track('A', talk('x', '12:30', '12:55')))
    const res = moveServiceSession(
      s,
      serviceDrag('Lunch', '12:00', '13:00'),
      drop(0, '12:00'),
    )
    expect(res.ok).toBe(false)
  })

  it('moves an existing service, excluding its own slot from the check', () => {
    const s = schedule(track('A', service('Break', '12:00', '12:15')))
    const dragItem = serviceDrag('Break', '12:00', '12:15', {
      sourceTrackIndex: 0,
      sourceTimeSlot: '12:00',
    })
    const res = moveServiceSession(s, dragItem, drop(0, '12:05'))
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks).toHaveLength(1)
    expect(res.schedule.tracks[0].talks[0].startTime).toBe('12:05')
  })
})

describe('track operations', () => {
  it('addTrack appends a track', () => {
    const s = schedule(track('A'))
    const res = addTrack(s, track('B'))
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks.map((t) => t.trackTitle)).toEqual(['A', 'B'])
  })

  it('removeTrack removes by index and rejects out-of-range', () => {
    const s = schedule(track('A'), track('B'))
    expect(removeTrack(s, 5).ok).toBe(false)
    const res = removeTrack(s, 0)
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks.map((t) => t.trackTitle)).toEqual(['B'])
  })

  it('updateTrack replaces the track at index', () => {
    const s = schedule(track('A'))
    const res = updateTrack(s, 0, track('A2'))
    expect(res.schedule.tracks[0].trackTitle).toBe('A2')
    expect(updateTrack(s, 9, track('X')).ok).toBe(false)
  })

  it('removeTalk removes a talk from a track', () => {
    const s = schedule(track('A', talk('a', '10:00', '10:25')))
    const res = removeTalk(s, 0, 0)
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks).toHaveLength(0)
    expect(removeTalk(s, 0, 9).ok).toBe(false)
  })
})

describe('service add/resize/rename', () => {
  it('addService inserts a sorted service session', () => {
    const s = schedule(track('A', service('Late', '15:00', '15:30')))
    const res = addService(s, 0, {
      title: 'Coffee',
      startTime: '10:00',
      duration: 15,
    })
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks[0].placeholder).toBe('Coffee')
    expect(res.schedule.tracks[0].talks[0].endTime).toBe('10:15')
  })

  it('addService rejects a session overlapping an existing item', () => {
    const s = schedule(track('A', talk('a', '10:00', '10:45')))
    // A 30-min break at 10:15 would sit inside the 10:00–10:45 talk.
    expect(
      addService(s, 0, { title: 'Coffee', startTime: '10:15', duration: 30 })
        .ok,
    ).toBe(false)
  })

  it('resizeService updates the endTime from the duration', () => {
    const s = schedule(track('A', service('Break', '10:00', '10:15')))
    const res = resizeService(s, 0, 0, 30)
    expect(res.schedule.tracks[0].talks[0].endTime).toBe('10:30')
  })

  it('resizeService rejects a resize that overlaps the following item', () => {
    const s = schedule(
      track(
        'A',
        service('Break', '10:00', '10:15'),
        talk('a', '10:20', '10:45'),
      ),
    )
    // Growing the break to 30 min (→10:30) would overlap the 10:20 talk.
    expect(resizeService(s, 0, 0, 30).ok).toBe(false)
  })

  it('resizeService ignores a real talk (not a service session)', () => {
    const s = schedule(track('A', talk('a', '10:00', '10:25')))
    expect(resizeService(s, 0, 0, 60).ok).toBe(false)
  })

  it('renameService updates the placeholder', () => {
    const s = schedule(track('A', service('Break', '10:00', '10:15')))
    const res = renameService(s, 0, 0, 'Coffee Break')
    expect(res.schedule.tracks[0].talks[0].placeholder).toBe('Coffee Break')
  })

  it('addService rejects an empty / whitespace title (F7)', () => {
    const s = schedule(track('A'))
    expect(
      addService(s, 0, { title: '', startTime: '10:00', duration: 15 }).ok,
    ).toBe(false)
    expect(
      addService(s, 0, { title: '   ', startTime: '10:00', duration: 15 }).ok,
    ).toBe(false)
  })

  it('addService trims a padded title (F7)', () => {
    const s = schedule(track('A'))
    const res = addService(s, 0, {
      title: '  Coffee  ',
      startTime: '10:00',
      duration: 15,
    })
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks[0].placeholder).toBe('Coffee')
  })

  it('renameService rejects an empty / whitespace title (F7)', () => {
    const s = schedule(track('A', service('Break', '10:00', '10:15')))
    expect(renameService(s, 0, 0, '').ok).toBe(false)
    expect(renameService(s, 0, 0, '   ').ok).toBe(false)
    expect(renameService(s, 0, 0, '   ').schedule).toBe(s)
  })

  it('renameService trims a padded title (F7)', () => {
    const s = schedule(track('A', service('Break', '10:00', '10:15')))
    const res = renameService(s, 0, 0, '  Lunch  ')
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks[0].placeholder).toBe('Lunch')
  })
})

describe('end-of-day clamp (nothing may end after SCHEDULE_END 21:00)', () => {
  it('moveProposal rejects a fresh drop whose end exceeds 21:00', () => {
    const s = schedule(track('A'))
    const dragItem: DragItem = { type: 'proposal', proposal: proposal('p') }
    // talk_25 at 20:45 → 21:10, past the 21:00 grid end.
    expect(moveProposal(s, dragItem, drop(0, '20:45')).ok).toBe(false)
  })

  it('moveProposal allows a drop ending exactly at 21:00', () => {
    const s = schedule(track('A'))
    const dragItem: DragItem = {
      type: 'proposal',
      proposal: proposal('p', 'talk_15'),
    }
    // talk_15 at 20:45 → 21:00, the boundary is inclusive.
    const res = moveProposal(s, dragItem, drop(0, '20:45'))
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks[0].endTime).toBe('21:00')
  })

  it('moveServiceSession rejects a session whose end exceeds 21:00', () => {
    const s = schedule(track('A'))
    const dragItem: DragItem = {
      type: 'service-session',
      serviceSession: {
        placeholder: 'Break',
        startTime: '10:00',
        endTime: '11:00',
      },
    }
    // 60-min session dropped at 20:30 → 21:30, past 21:00.
    expect(moveServiceSession(s, dragItem, drop(0, '20:30')).ok).toBe(false)
  })

  it('addService rejects a session whose end exceeds 21:00', () => {
    const s = schedule(track('A'))
    expect(
      addService(s, 0, { title: 'Break', startTime: '20:45', duration: 30 }).ok,
    ).toBe(false)
  })

  it('addService allows a session ending exactly at 21:00', () => {
    const s = schedule(track('A'))
    const res = addService(s, 0, {
      title: 'Break',
      startTime: '20:30',
      duration: 30,
    })
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[0].talks[0].endTime).toBe('21:00')
  })

  it('resizeService rejects a resize whose end exceeds 21:00', () => {
    const s = schedule(track('A', service('Break', '20:30', '20:45')))
    // Growing to 60 min → 21:30, past 21:00.
    expect(resizeService(s, 0, 0, 60).ok).toBe(false)
  })

  it('rejects a fresh drop whose 24h-WRAPPED end reads as within the day (F1)', () => {
    // workshop_240 at 20:00 ends at 00:00 (wraps mod 24h). The old
    // withinScheduleEnd(calculateEndTime(...)) saw 00:00 (0 min) ≤ 21:00 and
    // wrongly allowed it; endsWithinScheduleDay sums 20:00 + 240 = 24:00 > 21:00.
    const s = schedule(track('A'))
    const dragItem: DragItem = {
      type: 'proposal',
      proposal: proposal('p', 'workshop_240'),
    }
    expect(classifyProposalDrop(s.tracks, dragItem, drop(0, '20:00'))).toBe(
      'invalid',
    )
    expect(moveProposal(s, dragItem, drop(0, '20:00')).ok).toBe(false)
  })

  it('rejects a MOVE of a scheduled talk whose wrapped end reads as within the day (F1)', () => {
    // Same wrap, over an existing talk: a workshop_240 dragged to 20:00 must not
    // classify as a swap/move onto a 20:30 talk just because its end wrapped.
    const s = schedule(
      track('A', talk('victim', '20:30', '20:55')),
      track('B', {
        kind: 'talk',
        talk: proposal('w', 'workshop_240'),
        startTime: '08:00',
        endTime: '12:00',
      }),
    )
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('w', 'workshop_240'),
      sourceTrackIndex: 1,
      sourceTimeSlot: '08:00',
    }
    expect(classifyProposalDrop(s.tracks, dragItem, drop(0, '20:00'))).toBe(
      'invalid',
    )
    expect(moveProposal(s, dragItem, drop(0, '20:00')).ok).toBe(false)
  })

  it('addService rejects a huge duration that would wrap past midnight (F1)', () => {
    const s = schedule(track('A'))
    // 20:00 + 300 min = 25:00; the wrapped end (01:00) must not read as valid.
    expect(
      addService(s, 0, { title: 'Marathon', startTime: '20:00', duration: 300 })
        .ok,
    ).toBe(false)
  })

  it('resizeService rejects a huge duration that would wrap past midnight (F1)', () => {
    const s = schedule(track('A', service('Break', '20:00', '20:15')))
    // 20:00 + 300 → 01:00 wrapped; must be rejected, not accepted.
    expect(resizeService(s, 0, 0, 300).ok).toBe(false)
  })

  it('moveServiceSession rejects a service whose wrapped end reads as within the day (F1)', () => {
    const s = schedule(track('A'))
    const dragItem: DragItem = {
      type: 'service-session',
      serviceSession: {
        placeholder: 'Long',
        startTime: '08:00',
        endTime: '12:00', // a 240-min session
      },
    }
    // Dropped at 20:00 → 00:00 wrapped; endsWithinScheduleDay rejects.
    expect(classifyServiceDrop(s.tracks, dragItem, drop(0, '20:00'))).toBe(
      'invalid',
    )
    expect(moveServiceSession(s, dragItem, drop(0, '20:00')).ok).toBe(false)
  })
})

describe('F4 — stale / out-of-range drag source', () => {
  it('rejects a scheduled-talk drag whose source track index is out of range (no throw)', () => {
    const s = schedule(track('A', talk('a', '10:00', '10:25')), track('B'))
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a'),
      sourceTrackIndex: 9, // out of range
      sourceTimeSlot: '10:00',
    }
    expect(classifyProposalDrop(s.tracks, dragItem, drop(1, '11:00'))).toBe(
      'invalid',
    )
    // The apply path used to index newTracks[9].talks and throw; now it fails soft.
    expect(() => moveProposal(s, dragItem, drop(1, '11:00'))).not.toThrow()
    expect(moveProposal(s, dragItem, drop(1, '11:00')).ok).toBe(false)
  })

  it('rejects a scheduled-talk drag whose source slot is stale (no duplication)', () => {
    // Source track exists but the talk is no longer at sourceTimeSlot (it was
    // '09:00', the talk actually sits at '10:00'). Removing nothing then re-adding
    // would duplicate it; require the source slot to still match.
    const s = schedule(track('A', talk('a', '10:00', '10:25')), track('B'))
    const dragItem: DragItem = {
      type: 'scheduled-talk',
      proposal: proposal('a'),
      sourceTrackIndex: 0,
      sourceTimeSlot: '09:00', // stale
    }
    const res = moveProposal(s, dragItem, drop(1, '11:00'))
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
    // 'a' still appears exactly once, only in track A.
    const allIds = res.schedule.tracks.flatMap((t) =>
      t.talks.map((x) => x.talk?._id),
    )
    expect(allIds.filter((id) => id === 'a')).toHaveLength(1)
  })

  it('rejects a scheduled-service drag whose source is out of range (no throw)', () => {
    const s = schedule(
      track('A', service('Break', '10:00', '10:15')),
      track('B'),
    )
    const dragItem: DragItem = {
      type: 'scheduled-service',
      serviceSession: {
        placeholder: 'Break',
        startTime: '10:00',
        endTime: '10:15',
      },
      sourceTrackIndex: 9,
      sourceTimeSlot: '10:00',
    }
    expect(classifyServiceDrop(s.tracks, dragItem, drop(1, '11:00'))).toBe(
      'invalid',
    )
    expect(() =>
      moveServiceSession(s, dragItem, drop(1, '11:00')),
    ).not.toThrow()
    expect(moveServiceSession(s, dragItem, drop(1, '11:00')).ok).toBe(false)
  })

  it('rejects a scheduled-service drag whose source slot is stale (no duplication)', () => {
    const s = schedule(
      track('A', service('Break', '10:00', '10:15')),
      track('B'),
    )
    const dragItem: DragItem = {
      type: 'scheduled-service',
      serviceSession: {
        placeholder: 'Break',
        startTime: '10:00',
        endTime: '10:15',
      },
      sourceTrackIndex: 0,
      sourceTimeSlot: '09:00', // stale
    }
    const res = moveServiceSession(s, dragItem, drop(1, '11:00'))
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
    const allPlaceholders = res.schedule.tracks.flatMap((t) =>
      t.talks.map((x) => x.placeholder),
    )
    expect(allPlaceholders.filter((p) => p === 'Break')).toHaveLength(1)
  })
})

describe('F5 — service dropped on its own slot is a no-op', () => {
  it('classifies a same-track same-slot service drop as invalid (not a dirtying move)', () => {
    const s = schedule(track('A', service('Break', '12:00', '12:15')))
    const dragItem: DragItem = {
      type: 'scheduled-service',
      serviceSession: {
        placeholder: 'Break',
        startTime: '12:00',
        endTime: '12:15',
      },
      sourceTrackIndex: 0,
      sourceTimeSlot: '12:00',
    }
    expect(classifyServiceDrop(s.tracks, dragItem, drop(0, '12:00'))).toBe(
      'invalid',
    )
    const res = moveServiceSession(s, dragItem, drop(0, '12:00'))
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
  })
})

describe('duplicateService — skips conflicting tracks', () => {
  it('copies into free tracks and SKIPS tracks where it would overlap', () => {
    const s = schedule(
      track('Source'),
      track('Free'),
      track('Busy', talk('x', '10:10', '10:40')),
    )
    const session = service('Break', '10:00', '10:15')
    const res = duplicateService(s, session, 0)

    expect(res.ok).toBe(true)
    // Free track gets the copy...
    expect(res.schedule.tracks[1].talks.map((t) => t.placeholder)).toContain(
      'Break',
    )
    // ...Busy track is left untouched (would overlap x@10:10)
    expect(res.schedule.tracks[2].talks).toHaveLength(1)
    expect(res.schedule.tracks[2].talks[0].talk?._id).toBe('x')
    // ...Source track is never a target
    expect(res.schedule.tracks[0].talks).toHaveLength(0)
  })

  it('returns ok:false when every other track conflicts', () => {
    const s = schedule(
      track('Source'),
      track('Busy', talk('x', '10:05', '10:30')),
    )
    const res = duplicateService(s, service('Break', '10:00', '10:15'), 0)
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
  })

  it('rejects a talk-bearing slot instead of minting placeholder:"" copies (F8)', () => {
    const s = schedule(track('Source'), track('Free'))
    // A real talk slot is not a service; duplicating it would copy an untitled
    // ghost service into the other tracks.
    const res = duplicateService(s, talk('x', '10:00', '10:25'), 0)
    expect(res.ok).toBe(false)
    expect(res.schedule).toBe(s)
    expect(res.schedule.tracks[1].talks).toHaveLength(0)
  })

  it('rejects a ghost slot with no placeholder (F8)', () => {
    const s = schedule(track('Source'), track('Free'))
    const ghost = { startTime: '10:00', endTime: '10:15' } as unknown as Slot
    const res = duplicateService(s, ghost, 0)
    expect(res.ok).toBe(false)
    expect(res.schedule.tracks[1].talks).toHaveLength(0)
  })

  it('rejects a session whose stored end runs past the end of the day (F8)', () => {
    const s = schedule(track('Source'), track('Free'))
    // Stored 20:00–21:30 (past SCHEDULE_END 21:00); the end-of-day re-check must
    // reject before copying it into another track.
    const res = duplicateService(s, service('Late', '20:00', '21:30'), 0)
    expect(res.ok).toBe(false)
    expect(res.schedule.tracks[1].talks).toHaveLength(0)
  })

  it('trims the placeholder on the copies (F8)', () => {
    const s = schedule(track('Source'), track('Free'))
    const res = duplicateService(s, service('  Break  ', '10:00', '10:15'), 0)
    expect(res.ok).toBe(true)
    expect(res.schedule.tracks[1].talks[0].placeholder).toBe('Break')
  })
})

describe('computeUnassigned', () => {
  it('returns proposals not scheduled on ANY day', () => {
    const day0 = schedule(track('A', talk('p1', '10:00', '10:25')))
    const day1 = schedule(track('B', talk('p2', '10:00', '10:25')))
    const proposals = [proposal('p1'), proposal('p2'), proposal('p3')]
    const result = computeUnassigned(proposals, [day0, day1])
    expect(result.map((p) => p._id)).toEqual(['p3'])
  })

  it('returns all proposals when nothing is scheduled', () => {
    const proposals = [proposal('p1'), proposal('p2')]
    expect(computeUnassigned(proposals, [schedule(track('A'))])).toHaveLength(2)
  })
})

// The drop indicators in BOTH UIs (desktop `TimeSlotDropZone.canDrop`, mobile
// `segmentState`) call the classifiers, while the actual drop calls the reducer
// ops. If the two ever diverge, the UI promises a drop the reducer then rejects
// (or vice-versa). These tests pin the classifier's verdict to the op's outcome
// on identical fixtures, so any future edit to one without the other fails here.
describe('classifier ⇔ reducer equivalence', () => {
  const proposalCases: Array<{
    name: string
    build: () => {
      s: EditorSchedule
      d: DragItem
      p: DropPosition
      others?: Set<string>
      expectSwap?: boolean
    }
  }> = [
    {
      name: 'move into a free slot',
      build: () => ({
        s: schedule(track('A'), track('B')),
        d: { type: 'proposal', proposal: proposal('p') },
        p: drop(1, '11:00'),
      }),
    },
    {
      name: 'reject an out-of-bounds track index',
      build: () => ({
        s: schedule(track('A')),
        d: { type: 'proposal', proposal: proposal('p') },
        p: drop(5, '10:00'),
      }),
    },
    {
      name: 'reject a proposal already scheduled elsewhere (duplicate guard)',
      build: () => ({
        s: schedule(track('A')),
        d: { type: 'proposal', proposal: proposal('p') },
        p: drop(0, '10:00'),
        others: new Set(['p']),
      }),
    },
    {
      name: 'reject a drop that runs past the end of the day',
      build: () => ({
        s: schedule(track('A')),
        d: { type: 'proposal', proposal: proposal('p') },
        p: drop(0, '20:45'),
      }),
    },
    {
      name: 'swap two talks across tracks',
      build: () => ({
        s: schedule(
          track('A', talk('a', '10:00', '10:25')),
          track('B', talk('b', '11:00', '11:25')),
        ),
        d: {
          type: 'scheduled-talk',
          proposal: proposal('a'),
          sourceTrackIndex: 0,
          sourceTimeSlot: '10:00',
        },
        p: drop(1, '11:00'),
        expectSwap: true,
      }),
    },
    {
      name: 'reject dropping a talk back onto its own slot (no-op)',
      build: () => ({
        s: schedule(track('A', talk('a', '10:00', '10:25'))),
        d: {
          type: 'scheduled-talk',
          proposal: proposal('a'),
          sourceTrackIndex: 0,
          sourceTimeSlot: '10:00',
        },
        p: drop(0, '10:00'),
      }),
    },
    {
      name: 'reject a drop whose end wraps past midnight (F1)',
      build: () => ({
        s: schedule(track('A')),
        d: { type: 'proposal', proposal: proposal('p', 'workshop_240') },
        p: drop(0, '20:00'),
      }),
    },
    {
      name: 'reject a swap whose displaced talk would run past end of day (F2)',
      build: () => ({
        // a(talk_25)@20:35 dragged onto b(talk_45)@10:00; b displaced to 20:35
        // for its 45m format → 21:20, past 21:00.
        s: schedule(
          track('A', talk('a', '20:35', '21:00')),
          track('B', {
            kind: 'talk',
            talk: proposal('b', 'presentation_45'),
            startTime: '10:00',
            endTime: '10:45',
          }),
        ),
        d: {
          type: 'scheduled-talk',
          proposal: proposal('a', 'talk_25'),
          sourceTrackIndex: 0,
          sourceTimeSlot: '20:35',
        },
        p: drop(1, '10:00'),
      }),
    },
    {
      name: 'reject a scheduled-talk drag with an out-of-range source (F4)',
      build: () => ({
        s: schedule(track('A', talk('a', '10:00', '10:25')), track('B')),
        d: {
          type: 'scheduled-talk',
          proposal: proposal('a'),
          sourceTrackIndex: 9,
          sourceTimeSlot: '10:00',
        },
        p: drop(1, '11:00'),
      }),
    },
    {
      name: 'reject a scheduled-talk drag with a stale source slot (F4)',
      build: () => ({
        s: schedule(track('A', talk('a', '10:00', '10:25')), track('B')),
        d: {
          type: 'scheduled-talk',
          proposal: proposal('a'),
          sourceTrackIndex: 0,
          sourceTimeSlot: '09:00',
        },
        p: drop(1, '11:00'),
      }),
    },
  ]

  proposalCases.forEach(({ name, build }) => {
    it(`proposal: ${name}`, () => {
      const { s, d, p, others, expectSwap } = build()
      const kind = classifyProposalDrop(s.tracks, d, p, others)
      const op = moveProposal(s, d, p, others)
      expect(kind !== 'invalid').toBe(op.ok)
      if (expectSwap) {
        expect(kind).toBe('swap')
        // A swap displaces the target talk back to the source rather than
        // dropping it: the target track keeps exactly one talk.
        expect(op.schedule.tracks[p.trackIndex].talks).toHaveLength(1)
      }
    })
  })

  const serviceDrag = (
    placeholder: string,
    start: string,
    end: string,
    source?: { sourceTrackIndex: number; sourceTimeSlot: string },
  ): DragItem => {
    const serviceSession = { placeholder, startTime: start, endTime: end }
    return source
      ? { type: 'scheduled-service', serviceSession, ...source }
      : { type: 'service-session', serviceSession }
  }

  const serviceCases: Array<{
    name: string
    build: () => { s: EditorSchedule; d: DragItem; p: DropPosition }
  }> = [
    {
      name: 'place a service into a free interval',
      build: () => ({
        s: schedule(track('A')),
        d: serviceDrag('Lunch', '12:00', '13:00'),
        p: drop(0, '12:00'),
      }),
    },
    {
      name: 'reject a service overlapping an existing talk',
      build: () => ({
        s: schedule(track('A', talk('x', '12:30', '12:55'))),
        d: serviceDrag('Lunch', '12:00', '13:00'),
        p: drop(0, '12:00'),
      }),
    },
    {
      name: 'move an existing service, excluding its own slot',
      build: () => ({
        s: schedule(track('A', service('Break', '12:00', '12:15'))),
        d: serviceDrag('Break', '12:00', '12:15', {
          sourceTrackIndex: 0,
          sourceTimeSlot: '12:00',
        }),
        p: drop(0, '12:05'),
      }),
    },
    {
      name: 'reject a service whose end wraps past midnight (F1)',
      build: () => ({
        s: schedule(track('A')),
        d: serviceDrag('Long', '08:00', '12:00'), // 240m
        p: drop(0, '20:00'),
      }),
    },
    {
      name: 'reject a service dropped on its own slot — no-op (F5)',
      build: () => ({
        s: schedule(track('A', service('Break', '12:00', '12:15'))),
        d: serviceDrag('Break', '12:00', '12:15', {
          sourceTrackIndex: 0,
          sourceTimeSlot: '12:00',
        }),
        p: drop(0, '12:00'),
      }),
    },
    {
      name: 'reject a scheduled-service drag with an out-of-range source (F4)',
      build: () => ({
        s: schedule(track('A', service('Break', '12:00', '12:15')), track('B')),
        d: serviceDrag('Break', '12:00', '12:15', {
          sourceTrackIndex: 9,
          sourceTimeSlot: '12:00',
        }),
        p: drop(1, '13:00'),
      }),
    },
    {
      name: 'reject a scheduled-service drag with a stale source slot (F4)',
      build: () => ({
        s: schedule(track('A', service('Break', '12:00', '12:15')), track('B')),
        d: serviceDrag('Break', '12:00', '12:15', {
          sourceTrackIndex: 0,
          sourceTimeSlot: '09:00',
        }),
        p: drop(1, '13:00'),
      }),
    },
  ]

  serviceCases.forEach(({ name, build }) => {
    it(`service: ${name}`, () => {
      const { s, d, p } = build()
      const kind = classifyServiceDrop(s.tracks, d, p)
      const op = moveServiceSession(s, d, p)
      expect(kind === 'move').toBe(op.ok)
    })
  })

  it('cross-day set: the guard rejects a proposal scheduled on another day', () => {
    // Same fixtures both callers use: reducer computes the set, then the UIs
    // read the SAME set from context/props, so classify must agree with the op.
    const days = [
      schedule(track('Day1', talk('p', '10:00', '10:25'))),
      schedule(track('Day2')),
    ]
    const others = scheduledProposalIdsExcludingDay(days, 1)
    expect(others.has('p')).toBe(true)

    const d: DragItem = { type: 'proposal', proposal: proposal('p') }
    const p = drop(0, '11:00')
    // Day 2 has room, but `p` already lives on day 1 → both must refuse.
    expect(classifyProposalDrop(days[1].tracks, d, p, others)).toBe('invalid')
    expect(moveProposal(days[1], d, p, others).ok).toBe(false)
    // Without the set the SAME drop is legal — proving the set is the only
    // reason it fails, i.e. a UI omitting it would light up a rejected slot.
    expect(classifyProposalDrop(days[1].tracks, d, p)).toBe('move')
  })

  it('cross-day set: EXCLUDES the queried day so same-day talks do not self-block', () => {
    const days = [schedule(track('Day1', talk('p', '10:00', '10:25')))]
    expect(scheduledProposalIdsExcludingDay(days, 0).has('p')).toBe(false)
  })
})
