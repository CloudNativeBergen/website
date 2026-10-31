import { describe, expect, it } from 'vitest'
import {
  osloDateCutoff,
  osloMonthsCutoff,
  reminderLogsExpired,
} from './cutoffs'

describe('osloMonthsCutoff', () => {
  it('steps back whole calendar months on the Oslo day', () => {
    // 23:30 UTC on Oct 31 is already Nov 1 in Oslo.
    expect(osloMonthsCutoff(24, new Date('2026-10-31T23:30:00Z'))).toBe(
      '2024-11-01',
    )
    expect(osloMonthsCutoff(24, new Date('2026-10-31T12:00:00Z'))).toBe(
      '2024-10-31',
    )
  })

  it('clamps to the end of a shorter month', () => {
    expect(osloMonthsCutoff(1, new Date('2026-03-31T12:00:00Z'))).toBe(
      '2026-02-28',
    )
    expect(osloMonthsCutoff(24, new Date('2026-02-28T12:00:00Z'))).toBe(
      '2024-02-28',
    )
  })
})

describe('retention cutoffs', () => {
  it('expires reminder logs only after more than 60 days', () => {
    const now = new Date('2026-03-01T12:00:00Z') // 2026-03-01 in Oslo
    // Jan 1 ended 59 days ago, Dec 31 60 days ago, Dec 30 61 days ago.
    expect(reminderLogsExpired('2026-01-01', now)).toBe(false)
    expect(reminderLogsExpired('2025-12-31', now)).toBe(false)
    expect(reminderLogsExpired('2025-12-30', now)).toBe(true)
  })

  it('uses the Oslo day, not the UTC day, around midnight', () => {
    // 23:30 UTC on Jun 30 is already Jul 1 in Oslo (CEST, UTC+2).
    expect(osloDateCutoff(60, new Date('2026-06-30T23:30:00Z'))).toBe(
      '2026-05-02',
    )
    // 23:30 UTC on Dec 31 is already Jan 1 in Oslo (CET, UTC+1).
    expect(osloDateCutoff(60, new Date('2026-12-31T23:30:00Z'))).toBe(
      '2026-11-02',
    )
  })

  it('is unaffected by a DST change inside the window', () => {
    // Spans the 2026-03-29 spring-forward and the 2026-10-25 fall-back.
    expect(osloDateCutoff(60, new Date('2026-05-10T00:30:00Z'))).toBe(
      '2026-03-11',
    )
    expect(osloDateCutoff(60, new Date('2026-11-15T10:00:00Z'))).toBe(
      '2026-09-16',
    )
  })
})
