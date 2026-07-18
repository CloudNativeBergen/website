/**
 * Tests for the SAVE payload zod schema (src/server/schemas/schedule.ts).
 *
 * The router uses this schema as its tRPC input, so these are the FIRST gate a
 * client payload passes. Guards the review-batch-2 hardening:
 *   F3 — an existing schedule (non-empty `_id`) must carry its `_rev`.
 *   F4 — `date` must be a real YYYY-MM-DD calendar date.
 *   F5 — size caps on titles/descriptions/arrays reject oversized payloads.
 */
import { describe, it, expect } from 'vitest'
import { SaveScheduleSchema } from '@/server/schemas/schedule'

const validTrack = () => ({
  trackTitle: 'Track A',
  trackDescription: '',
  talks: [
    { talk: { _id: 't1' }, startTime: '09:00', endTime: '09:30' },
    { placeholder: 'Lunch', startTime: '12:00', endTime: '13:00' },
  ],
})

const base = (overrides: Record<string, unknown> = {}) => ({
  _id: 'sched-1',
  _rev: 'rev-1',
  date: '2026-06-15',
  tracks: [validTrack()],
  ...overrides,
})

describe('SaveScheduleSchema — happy path', () => {
  it('accepts a well-formed update payload', () => {
    expect(SaveScheduleSchema.safeParse(base()).success).toBe(true)
  })

  it('accepts a create payload (empty _id, no _rev)', () => {
    const result = SaveScheduleSchema.safeParse(
      base({ _id: '', _rev: undefined }),
    )
    expect(result.success).toBe(true)
  })
})

describe('SaveScheduleSchema — _rev required for updates (F3)', () => {
  it('rejects an update (non-empty _id) without a _rev', () => {
    const result = SaveScheduleSchema.safeParse(base({ _rev: undefined }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['_rev'])
    }
  })

  it('rejects an update with an empty-string _rev', () => {
    const result = SaveScheduleSchema.safeParse(base({ _rev: '' }))
    expect(result.success).toBe(false)
  })
})

describe('SaveScheduleSchema — date validation (F4)', () => {
  it('accepts a real calendar date', () => {
    expect(
      SaveScheduleSchema.safeParse(base({ date: '2026-02-28' })).success,
    ).toBe(true)
  })

  it('rejects a malformed date shape', () => {
    expect(
      SaveScheduleSchema.safeParse(base({ date: '2026-6-1' })).success,
    ).toBe(false)
    expect(
      SaveScheduleSchema.safeParse(base({ date: 'not-a-date' })).success,
    ).toBe(false)
  })

  it('rejects an impossible calendar date (Feb 30 / month 13)', () => {
    expect(
      SaveScheduleSchema.safeParse(base({ date: '2026-02-30' })).success,
    ).toBe(false)
    expect(
      SaveScheduleSchema.safeParse(base({ date: '2026-13-01' })).success,
    ).toBe(false)
  })
})

describe('SaveScheduleSchema — size bounds (F5)', () => {
  it('rejects a track title over 200 chars', () => {
    const bad = base({
      tracks: [{ ...validTrack(), trackTitle: 'x'.repeat(201) }],
    })
    expect(SaveScheduleSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a trackDescription over 2000 chars', () => {
    const bad = base({
      tracks: [{ ...validTrack(), trackDescription: 'x'.repeat(2001) }],
    })
    expect(SaveScheduleSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a placeholder over 200 chars', () => {
    const bad = base({
      tracks: [
        {
          ...validTrack(),
          talks: [
            {
              placeholder: 'x'.repeat(201),
              startTime: '12:00',
              endTime: '13:00',
            },
          ],
        },
      ],
    })
    expect(SaveScheduleSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects more than 30 tracks', () => {
    const bad = base({ tracks: Array.from({ length: 31 }, validTrack) })
    expect(SaveScheduleSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects more than 300 talks in a track', () => {
    const slot = { placeholder: 'x', startTime: '09:00', endTime: '09:05' }
    const bad = base({
      tracks: [
        { ...validTrack(), talks: Array.from({ length: 301 }, () => slot) },
      ],
    })
    expect(SaveScheduleSchema.safeParse(bad).success).toBe(false)
  })
})
