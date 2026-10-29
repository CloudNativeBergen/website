import { describe, expect, it } from 'vitest'
import { deletionDate, deletionDateEnd } from './deletion'

describe('deletionDate (Photo Wall spec §11.1)', () => {
  it('is the conference end date plus 30 days: CNDN 2026 is 26 November', () => {
    expect(deletionDate('2026-10-27')).toBe('2026-11-26')
  })

  it('crosses a year end and a leap day on the calendar, not by adding seconds', () => {
    expect(deletionDate('2026-12-15')).toBe('2027-01-14')
    expect(deletionDate('2028-02-01')).toBe('2028-03-02')
  })

  it('is null without a usable end date', () => {
    expect(deletionDate(null)).toBeNull()
    expect(deletionDate(undefined)).toBeNull()
    expect(deletionDate('')).toBeNull()
    expect(deletionDate('2026-02-30')).toBeNull()
    expect(deletionDate('2026-10-27T10:00:00Z')).toBeNull()
  })
})

describe('deletionDateEnd', () => {
  it('is 23:59:59 Europe/Oslo on the deletion date (CET in November: 22:59:59Z)', () => {
    expect(deletionDateEnd('2026-10-27')?.toISOString()).toBe(
      '2026-11-26T22:59:59.000Z',
    )
  })

  it('follows summer time: a deletion date in July ends at 21:59:59Z', () => {
    expect(deletionDateEnd('2026-06-10')?.toISOString()).toBe(
      '2026-07-10T21:59:59.000Z',
    )
  })

  it('is null without a usable end date', () => {
    expect(deletionDateEnd(null)).toBeNull()
    expect(deletionDateEnd('not a date')).toBeNull()
  })
})
