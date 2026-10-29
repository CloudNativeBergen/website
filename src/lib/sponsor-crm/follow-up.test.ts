import { describe, expect, it } from 'vitest'
import {
  followUpDateToIso,
  followUpInDays,
  isFollowUpOverdue,
  osloDatePlusDays,
} from './follow-up'

describe('follow-up dates', () => {
  it('adds days to the Oslo date, not the UTC date', () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Oslo.
    const now = new Date('2026-12-31T23:30:00Z')
    expect(osloDatePlusDays(3, now)).toBe('2027-01-04')
    expect(osloDatePlusDays(7, now)).toBe('2027-01-08')
    expect(osloDatePlusDays(14, now)).toBe('2027-01-15')
  })

  it('stores 09:00 Oslo time, across DST', () => {
    expect(followUpDateToIso('2026-07-01')).toBe('2026-07-01T07:00:00.000Z')
    expect(followUpDateToIso('2026-12-01')).toBe('2026-12-01T08:00:00.000Z')
    // 3 days from 23 Oct crosses the end of summer time (25 Oct).
    expect(followUpInDays(3, new Date('2026-10-23T10:00:00Z'))).toBe(
      '2026-10-26T08:00:00.000Z',
    )
  })

  it('is overdue once the instant has passed', () => {
    const now = new Date('2026-10-29T12:00:00Z')
    expect(isFollowUpOverdue('2026-10-29T08:00:00.000Z', now)).toBe(true)
    expect(isFollowUpOverdue('2026-10-30T08:00:00.000Z', now)).toBe(false)
    expect(isFollowUpOverdue(null, now)).toBe(false)
    expect(isFollowUpOverdue(undefined, now)).toBe(false)
  })
})
