import { describe, it, expect } from 'vitest'
import { spanEndLine } from '@/components/program/ProgramScheduleView'
import type { ScheduleTrack, TrackTalk } from '@/lib/conference/types'

const slot = (startTime: string, endTime: string) =>
  ({ placeholder: 'x', startTime, endTime }) as TrackTalk
const track = (...talks: TrackTalk[]) =>
  ({ trackTitle: 't', trackDescription: '', talks }) as ScheduleTrack
const cell = (t: TrackTalk) => [{ talk: t }]

// Row n starts at grid line n: 15:50=1 ... 17:00=6, and 7 closes the grid.
const slots = ['15:50', '16:10', '16:20', '16:30', '16:40', '17:00']

describe('spanEndLine', () => {
  it('spans a long slot until its end row', () => {
    const prep = slot('15:50', '17:00')
    expect(
      spanEndLine(track(prep, slot('17:00', '20:00')), cell(prep), slots),
    ).toBe(6)
  })

  it('runs through a row another track starts in', () => {
    const talk = slot('16:20', '16:40')
    expect(
      spanEndLine(track(talk, slot('16:40', '17:00')), cell(talk), slots),
    ).toBe(5)
  })

  it('never overlaps the next start in the same track', () => {
    const overrun = slot('16:10', '17:00')
    expect(
      spanEndLine(track(overrun, slot('16:30', '16:40')), cell(overrun), slots),
    ).toBe(4)
  })

  it('takes the last row alone when nothing follows', () => {
    const party = slot('17:00', '20:00')
    expect(spanEndLine(track(party), cell(party), slots)).toBe(7)
  })
})
