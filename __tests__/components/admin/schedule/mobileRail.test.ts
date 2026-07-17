/**
 * @vitest-environment node
 *
 * Tests for the mobile time-rail builder (buildTrackRail). It turns a track into
 * a chronological list of talk/break/open segments spanning the schedule day,
 * with `open` segments for every uncovered interval (the editor's tappable free
 * time).
 */
import { describe, it, expect } from 'vitest'
import type { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { buildTrackRail } from '@/components/admin/schedule/mobileRail'

const proposal = (id: string): ProposalExisting =>
  ({ _id: id, format: 'talk_25' }) as unknown as ProposalExisting

const talk = (id: string, start: string, end: string): TrackTalk => ({
  talk: proposal(id),
  startTime: start,
  endTime: end,
})

const service = (name: string, start: string, end: string): TrackTalk => ({
  placeholder: name,
  startTime: start,
  endTime: end,
})

const track = (...talks: TrackTalk[]): ScheduleTrack => ({
  trackTitle: 'A',
  trackDescription: '',
  talks,
})

const shape = (s: ReturnType<typeof buildTrackRail>) =>
  s.map((seg) => `${seg.kind}:${seg.startTime}-${seg.endTime}`)

describe('buildTrackRail', () => {
  it('collapses an empty track to a single full-day open segment', () => {
    expect(shape(buildTrackRail(track()))).toEqual(['open:08:00-21:00'])
  })

  it('wraps a lone talk with leading and trailing open time', () => {
    expect(shape(buildTrackRail(track(talk('x', '09:00', '09:25'))))).toEqual([
      'open:08:00-09:00',
      'talk:09:00-09:25',
      'open:09:25-21:00',
    ])
  })

  it('emits no open gap between back-to-back items', () => {
    const rail = buildTrackRail(
      track(talk('x', '08:00', '08:25'), service('Break', '08:25', '08:40')),
    )
    expect(shape(rail)).toEqual([
      'talk:08:00-08:25',
      'break:08:25-08:40',
      'open:08:40-21:00',
    ])
  })

  it('classifies placeholder slots as break and talk slots as talk', () => {
    const rail = buildTrackRail(
      track(service('Lunch', '12:00', '13:00'), talk('y', '13:00', '13:25')),
    )
    expect(rail[0].kind).toBe('open')
    expect(rail[1].kind).toBe('break')
    expect(rail[2].kind).toBe('talk')
  })

  it('drops leading open time when a talk starts at SCHEDULE_START', () => {
    const rail = buildTrackRail(track(talk('x', '08:00', '08:25')))
    expect(rail[0].kind).toBe('talk')
  })

  it('drops trailing open time when the last item ends at SCHEDULE_END', () => {
    const rail = buildTrackRail(track(talk('x', '20:35', '21:00')))
    expect(shape(rail)).toEqual(['open:08:00-20:35', 'talk:20:35-21:00'])
  })

  it('sorts out-of-order talks and preserves original talkIndex', () => {
    const rail = buildTrackRail(
      track(talk('late', '14:00', '14:25'), talk('early', '10:00', '10:25')),
    )
    const talks = rail.filter((s) => s.kind !== 'open')
    expect(talks.map((s) => s.startTime)).toEqual(['10:00', '14:00'])
    // 'early' is index 1 in the original array, 'late' is index 0
    expect(talks.map((s) => (s.kind !== 'open' ? s.talkIndex : -1))).toEqual([
      1, 0,
    ])
  })

  it('skips malformed slots without emitting a negative-width gap', () => {
    const rail = buildTrackRail(
      track(
        { talk: proposal('x'), startTime: '', endTime: '' } as TrackTalk,
        talk('y', '10:00', '10:25'),
      ),
    )
    expect(shape(rail)).toEqual([
      'open:08:00-10:00',
      'talk:10:00-10:25',
      'open:10:25-21:00',
    ])
  })
})
