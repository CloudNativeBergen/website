/**
 * @vitest-environment node
 *
 * Unit tests for the mobile rail's pure placement machine (mobile/placement.ts).
 * `segmentState` drives the rail's valid-target highlighting; it defers legality
 * to the shared engine classifiers, so these tests pin the parts it OWNS: source
 * detection, the min-open-slot gate, break/open/talk branch selection, and that
 * the cross-day set flows through for a fresh proposal.
 */
import { describe, it, expect } from 'vitest'
import type { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { Slot } from '@/lib/schedule/types'
import type { RailSegment } from '@/components/admin/schedule/mobile'
import type { Placing } from '@/components/admin/schedule/mobile'
import { segmentState } from '@/components/admin/schedule/mobile'

const proposal = (id: string, format = 'talk_25'): ProposalExisting =>
  ({ _id: id, format }) as unknown as ProposalExisting

const talk = (id: string, start: string, end: string): Slot => ({
  kind: 'talk',
  talk: proposal(id),
  startTime: start,
  endTime: end,
})

const track = (...talks: TrackTalk[]): ScheduleTrack => ({
  trackTitle: 'A',
  trackDescription: '',
  talks,
})

const openSeg = (start: string, end: string, dur: number): RailSegment => ({
  kind: 'open',
  startTime: start,
  endTime: end,
  durationMin: dur,
})

const talkSeg = (
  id: string,
  start: string,
  end: string,
  dur: number,
  idx: number,
): RailSegment => ({
  kind: 'talk',
  talk: talk(id, start, end),
  talkIndex: idx,
  startTime: start,
  endTime: end,
  durationMin: dur,
})

const breakSeg = (
  start: string,
  end: string,
  dur: number,
  idx: number,
): RailSegment => ({
  kind: 'break',
  talk: {
    kind: 'service',
    placeholder: 'Lunch',
    startTime: start,
    endTime: end,
  },
  talkIndex: idx,
  startTime: start,
  endTime: end,
  durationMin: dur,
})

const NO_OTHERS = new Set<string>()

describe('segmentState', () => {
  it("marks the pick-up's own segment as source", () => {
    const placing: Placing = {
      kind: 'scheduled',
      trackIndex: 0,
      talkIndex: 0,
      talk: talk('a', '10:00', '10:25'),
    }
    const seg = talkSeg('a', '10:00', '10:25', 25, 0)
    expect(
      segmentState(
        placing,
        [track(talk('a', '10:00', '10:25'))],
        0,
        seg,
        NO_OTHERS,
      ),
    ).toBe('source')
  })

  it('proposal → an open slot that fits is a valid move', () => {
    const placing: Placing = { kind: 'proposal', proposal: proposal('p') }
    expect(
      segmentState(
        placing,
        [track()],
        0,
        openSeg('10:00', '11:00', 60),
        NO_OTHERS,
      ),
    ).toBe('valid')
  })

  it('proposal → an open slot shorter than the minimum is invalid', () => {
    const placing: Placing = { kind: 'proposal', proposal: proposal('p') }
    expect(
      segmentState(
        placing,
        [track()],
        0,
        openSeg('10:00', '10:05', 5),
        NO_OTHERS,
      ),
    ).toBe('invalid')
  })

  it('proposal → a break segment is never a target', () => {
    const placing: Placing = { kind: 'proposal', proposal: proposal('p') }
    expect(
      segmentState(
        placing,
        [track()],
        0,
        breakSeg('12:00', '12:30', 30, 0),
        NO_OTHERS,
      ),
    ).toBe('invalid')
  })

  it('a fresh proposal scheduled on another day is rejected (cross-day set flows through)', () => {
    const placing: Placing = { kind: 'proposal', proposal: proposal('p') }
    expect(
      segmentState(
        placing,
        [track()],
        0,
        openSeg('10:00', '11:00', 60),
        new Set(['p']),
      ),
    ).toBe('invalid')
  })

  it('scheduled talk → an occupied talk that can swap is valid', () => {
    const placing: Placing = {
      kind: 'scheduled',
      trackIndex: 1,
      talkIndex: 0,
      talk: talk('a', '10:00', '10:25'),
    }
    const tracks = [
      track(talk('b', '10:00', '10:25')),
      track(talk('a', '10:00', '10:25')),
    ]
    expect(
      segmentState(
        placing,
        tracks,
        0,
        talkSeg('b', '10:00', '10:25', 25, 0),
        NO_OTHERS,
      ),
    ).toBe('valid')
  })

  it('scheduled service → an open slot is valid, onto a talk is invalid', () => {
    const placing: Placing = {
      kind: 'scheduled',
      trackIndex: 1,
      talkIndex: 0,
      talk: {
        kind: 'service',
        placeholder: 'Break',
        startTime: '09:00',
        endTime: '09:15',
      },
    }
    expect(
      segmentState(
        placing,
        [track()],
        0,
        openSeg('10:00', '11:00', 60),
        NO_OTHERS,
      ),
    ).toBe('valid')
    expect(
      segmentState(
        placing,
        [track(talk('a', '10:00', '10:25'))],
        0,
        talkSeg('a', '10:00', '10:25', 25, 0),
        NO_OTHERS,
      ),
    ).toBe('invalid')
  })
})
