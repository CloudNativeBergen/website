/**
 * Tests for the notification router input schemas
 * (src/server/schemas/notification.ts) — the first gate a client payload passes.
 */
import { describe, it, expect } from 'vitest'
import {
  ListNotificationsSchema,
  MarkReadSchema,
} from '@/server/schemas/notification'

describe('ListNotificationsSchema', () => {
  it('defaults limit to 20 when omitted', () => {
    const result = ListNotificationsSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(20)
    }
  })

  it('accepts limits within 1..50 and a valid ISO datetime cursor', () => {
    expect(
      ListNotificationsSchema.safeParse({
        limit: 50,
        before: '2026-07-01T00:00:00.000Z',
      }).success,
    ).toBe(true)
    expect(ListNotificationsSchema.safeParse({ limit: 1 }).success).toBe(true)
  })

  it('rejects a limit above 50, below 1, or non-integer', () => {
    expect(ListNotificationsSchema.safeParse({ limit: 51 }).success).toBe(false)
    expect(ListNotificationsSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(ListNotificationsSchema.safeParse({ limit: 2.5 }).success).toBe(
      false,
    )
  })

  it('rejects a non-datetime cursor', () => {
    expect(
      ListNotificationsSchema.safeParse({ before: 'not-a-date' }).success,
    ).toBe(false)
  })
})

describe('MarkReadSchema', () => {
  it('accepts 1..100 ids', () => {
    expect(MarkReadSchema.safeParse({ ids: ['a'] }).success).toBe(true)
    expect(
      MarkReadSchema.safeParse({
        ids: Array.from({ length: 100 }, (_, i) => `id-${i}`),
      }).success,
    ).toBe(true)
  })

  it('rejects an empty id list', () => {
    expect(MarkReadSchema.safeParse({ ids: [] }).success).toBe(false)
  })

  it('rejects more than 100 ids', () => {
    expect(
      MarkReadSchema.safeParse({
        ids: Array.from({ length: 101 }, (_, i) => `id-${i}`),
      }).success,
    ).toBe(false)
  })
})
