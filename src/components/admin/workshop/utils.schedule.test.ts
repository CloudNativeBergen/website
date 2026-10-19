import { describe, expect, it } from 'vitest'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { groupWorkshopsBySchedule } from './utils'

// The shape `getWorkshops({ includeScheduleInfo: true })` returns: the
// schedule track arrives as `room`, with top-level date and times.
const w = (_id: string, room?: string, startTime?: string) =>
  ({
    _id,
    ...(room && { date: '2026-10-27', room, startTime, endTime: '11:00' }),
  }) as unknown as ProposalWithWorkshopData

describe('groupWorkshopsBySchedule', () => {
  it('puts workshops in track columns and time rows', () => {
    const { days, unscheduled } = groupWorkshopsBySchedule([
      w('b', 'Track 2', '09:00'),
      w('a', 'Track 1', '11:00'),
      w('c', 'Track 1', '09:00'),
      w('d', 'Track 1', '09:00'),
      w('x'),
    ])
    expect(days).toHaveLength(1)
    expect(days[0].tracks).toEqual(['Track 1', 'Track 2'])
    expect(days[0].slots.map((s) => s.startTime)).toEqual(['09:00', '11:00'])
    expect(days[0].slots[0].cells.map((c) => c.map((x) => x._id))).toEqual([
      ['c', 'd'],
      ['b'],
    ])
    expect(days[0].slots[1].cells.map((c) => c.map((x) => x._id))).toEqual([
      ['a'],
      [],
    ])
    expect(unscheduled.map((u) => u._id)).toEqual(['x'])
  })
})
