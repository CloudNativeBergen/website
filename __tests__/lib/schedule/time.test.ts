/**
 * @vitest-environment node
 *
 * Unit tests for the pure schedule time helpers (src/lib/schedule/time.ts),
 * extracted from types.ts + five components during the schedule refactor
 * (Phase 0). Behaviour-preserving: these pin the arithmetic the whole editor
 * depends on before the rules/reducer phases build on it.
 */
import { describe, it, expect } from 'vitest'
import {
  toMinutes,
  toHHMM,
  addMinutes,
  calculateEndTime,
  durationBetween,
  timesOverlap,
  generateTimeSlots,
  getProposalDurationMinutes,
} from '@/lib/schedule/time'
import type { ProposalExisting } from '@/lib/proposal/types'

describe('toMinutes / toHHMM', () => {
  it('round-trips HH:MM', () => {
    for (const t of ['00:00', '08:00', '09:05', '13:30', '21:00', '23:55']) {
      expect(toHHMM(toMinutes(t))).toBe(t)
    }
  })
  it('toMinutes computes minutes since midnight', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('01:30')).toBe(90)
    expect(toMinutes('21:00')).toBe(1260)
  })
  it('toHHMM wraps at 24h (matches the old Date rollover)', () => {
    expect(toHHMM(1440)).toBe('00:00')
    expect(toHHMM(1500)).toBe('01:00')
    expect(toHHMM(-30)).toBe('23:30')
  })
})

describe('addMinutes / calculateEndTime', () => {
  it('adds minutes within a day', () => {
    expect(addMinutes('09:00', 25)).toBe('09:25')
    expect(addMinutes('10:45', 30)).toBe('11:15')
  })
  it('wraps past midnight', () => {
    expect(addMinutes('23:30', 90)).toBe('01:00')
  })
  it('calculateEndTime is addMinutes', () => {
    expect(calculateEndTime('12:00', 45)).toBe('12:45')
  })
})

describe('durationBetween', () => {
  it('returns end - start in minutes', () => {
    expect(durationBetween('09:00', '09:25')).toBe(25)
    expect(durationBetween('10:00', '11:30')).toBe(90)
  })
})

describe('timesOverlap', () => {
  it('detects overlapping intervals', () => {
    expect(timesOverlap('10:00', '10:45', '10:30', '11:00')).toBe(true)
    expect(timesOverlap('10:00', '11:00', '10:15', '10:30')).toBe(true) // contained
  })
  it('treats boundary-touching intervals as NOT overlapping', () => {
    expect(timesOverlap('10:00', '10:30', '10:30', '11:00')).toBe(false)
    expect(timesOverlap('10:30', '11:00', '10:00', '10:30')).toBe(false)
  })
  it('separate intervals do not overlap', () => {
    expect(timesOverlap('09:00', '09:30', '10:00', '10:30')).toBe(false)
  })
})

describe('generateTimeSlots', () => {
  it('is inclusive of both bounds at the given interval', () => {
    const slots = generateTimeSlots('08:00', '08:15', 5)
    expect(slots.map((s) => s.time)).toEqual([
      '08:00',
      '08:05',
      '08:10',
      '08:15',
    ])
  })
  it('spans a full day range with the default interval', () => {
    const slots = generateTimeSlots() // 08:00–21:00 every 5 min
    expect(slots[0].time).toBe('08:00')
    expect(slots[slots.length - 1].time).toBe('21:00')
    expect(slots).toHaveLength((13 * 60) / 5 + 1)
  })
})

describe('getProposalDurationMinutes', () => {
  const p = (format?: string): ProposalExisting =>
    ({ _id: 'x', format }) as unknown as ProposalExisting

  it('parses the minutes from "<type>_<minutes>"', () => {
    expect(getProposalDurationMinutes(p('presentation_25'))).toBe(25)
    expect(getProposalDurationMinutes(p('lightning_10'))).toBe(10)
    expect(getProposalDurationMinutes(p('workshop_120'))).toBe(120)
  })
  it('defaults to 25 for missing or unparseable formats', () => {
    expect(getProposalDurationMinutes(p(undefined))).toBe(25)
    expect(getProposalDurationMinutes(p('presentation'))).toBe(25)
    expect(getProposalDurationMinutes(p('weird_abc'))).toBe(25)
  })
})
