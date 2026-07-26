import { describe, expect, it } from 'vitest'
import { resolveCountdownTarget } from './countdown'
import type { Conference } from '@/lib/conference/types'

const conf = (startDate?: string) =>
  ({ startDate }) as unknown as Pick<Conference, 'startDate'>

describe('resolveCountdownTarget', () => {
  it('anchors the conference start date at 12:00 UTC (house anchoring)', () => {
    const ms = resolveCountdownTarget(conf('2099-09-15'), {})
    expect(ms).toBe(Date.UTC(2099, 8, 15, 12))
  })

  it('prefers targetOverride over the start date', () => {
    const ms = resolveCountdownTarget(conf('2099-09-15'), {
      targetOverride: '2099-01-01',
    })
    expect(ms).toBe(Date.UTC(2099, 0, 1, 12))
  })

  it('uses a full ISO override as-is (not date-anchored)', () => {
    const iso = '2099-09-15T09:30:00Z'
    const ms = resolveCountdownTarget(conf('2099-09-15'), {
      targetOverride: iso,
    })
    expect(ms).toBe(new Date(iso).getTime())
  })

  it('returns null when there is no start date and no override', () => {
    expect(resolveCountdownTarget(conf(undefined), {})).toBeNull()
  })

  it('returns null for an unparseable override', () => {
    expect(
      resolveCountdownTarget(conf('2099-09-15'), {
        targetOverride: 'not-a-date',
      }),
    ).toBeNull()
  })

  it('ignores a blank override and falls back to the start date', () => {
    const ms = resolveCountdownTarget(conf('2099-09-15'), {
      targetOverride: '   ',
    })
    expect(ms).toBe(Date.UTC(2099, 8, 15, 12))
  })
})
