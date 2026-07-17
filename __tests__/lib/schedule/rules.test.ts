/**
 * @vitest-environment node
 *
 * Truth-table tests for the schedule placement rules (src/lib/schedule/rules.ts).
 * These pin the CORRECTED behaviour introduced with the extraction: occupancy is
 * interval-based and includes service sessions, and swaps are validated in both
 * directions. Regression guards for:
 *   - talks can no longer be dropped straddling a break/lunch,
 *   - service sessions no longer bypass collision,
 *   - a cross-track swap can no longer overlap the source track.
 */
import { describe, it, expect } from 'vitest'
import type { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import {
  isTrackIntervalFree,
  findAvailableTimeSlot,
  canSwapTalks,
  canPlaceDisplacedBack,
  matchTalk,
} from '@/lib/schedule/rules'

const talk = (id: string, start: string, end: string): TrackTalk => ({
  talk: { _id: id } as ProposalExisting,
  startTime: start,
  endTime: end,
})
const service = (name: string, start: string, end: string): TrackTalk => ({
  placeholder: name,
  startTime: start,
  endTime: end,
})
const track = (...talks: TrackTalk[]): ScheduleTrack =>
  ({ trackTitle: 'T', talks }) as ScheduleTrack
const proposal = (id: string, format: string): ProposalExisting =>
  ({ _id: id, format }) as unknown as ProposalExisting

describe('isTrackIntervalFree', () => {
  it('is free against an empty track and against non-overlapping items', () => {
    expect(isTrackIntervalFree(track(), '10:00', '10:30')).toBe(true)
    expect(
      isTrackIntervalFree(track(talk('a', '09:00', '09:30')), '10:00', '10:30'),
    ).toBe(true)
  })
  it('treats a boundary touch as free (adjacent, not overlapping)', () => {
    expect(
      isTrackIntervalFree(track(talk('a', '10:30', '11:00')), '10:00', '10:30'),
    ).toBe(true)
  })
  it('detects overlap with a talk', () => {
    expect(
      isTrackIntervalFree(track(talk('a', '10:15', '10:45')), '10:00', '10:30'),
    ).toBe(false)
  })
  it('detects overlap with a SERVICE SESSION (the key fix)', () => {
    expect(
      isTrackIntervalFree(
        track(service('Lunch', '11:30', '12:30')),
        '12:00',
        '12:25',
      ),
    ).toBe(false)
  })
  it('honours the exclude matcher', () => {
    const t = track(talk('a', '10:00', '10:30'))
    expect(
      isTrackIntervalFree(t, '10:00', '10:30', matchTalk('a', '10:00')),
    ).toBe(true)
  })
})

describe('findAvailableTimeSlot', () => {
  it('returns the slot when the whole footprint is free', () => {
    expect(
      findAvailableTimeSlot(track(), proposal('p', 'talk_25'), '10:00'),
    ).toBe('10:00')
  })
  it('returns null when the talk would straddle a service session', () => {
    // 25-min talk at 12:00 (→12:25) over a 11:30–12:30 lunch.
    expect(
      findAvailableTimeSlot(
        track(service('Lunch', '11:30', '12:30')),
        proposal('p', 'talk_25'),
        '12:00',
      ),
    ).toBeNull()
  })
  it('returns null when it overlaps another talk', () => {
    expect(
      findAvailableTimeSlot(
        track(talk('a', '10:10', '10:40')),
        proposal('p', 'talk_25'),
        '10:00',
      ),
    ).toBeNull()
  })
})

describe('canSwapTalks + canPlaceDisplacedBack (bidirectional)', () => {
  it('allows a swap when both directions fit', () => {
    const target = track(talk('b', '10:00', '11:00'))
    const source = track(talk('a', '10:00', '10:20'))
    const dragged = proposal('a', 'talk_20')
    const targetTalk = target.talks[0]
    expect(canSwapTalks(target, dragged, targetTalk, '10:00')).toBe(true)
    // b (60min) placed back at 10:00 in the source (only 'a' there, which is leaving) fits.
    expect(
      canPlaceDisplacedBack(
        source,
        targetTalk,
        '10:00',
        matchTalk('a', '10:00'),
      ),
    ).toBe(true)
  })

  it('rejects the swap when the displaced talk would overlap the source track', () => {
    // Source: a@10:00(20m) leaving, plus c@10:25(25m) staying.
    const source = track(
      talk('a', '10:00', '10:20'),
      talk('c', '10:25', '10:50'),
    )
    // Target: b@10:00 is 45 min.
    const targetTalk = talk('b', '10:00', '10:45')
    const target = track(targetTalk)
    const dragged = proposal('a', 'talk_20')
    // Forward fits (a into target excluding b)...
    expect(canSwapTalks(target, dragged, targetTalk, '10:00')).toBe(true)
    // ...but b(45m) back at 10:00→10:45 overlaps c@10:25 in the source. REJECT.
    expect(
      canPlaceDisplacedBack(
        source,
        targetTalk,
        '10:00',
        matchTalk('a', '10:00'),
      ),
    ).toBe(false)
  })
})
