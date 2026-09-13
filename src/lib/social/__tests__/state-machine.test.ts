import { describe, it, expect } from 'vitest'
import {
  canOrganizerTransition,
  canTransition,
  decideAfterPublish,
  isStaleClaim,
  MAX_PUBLISH_ATTEMPTS,
  RETRY_BACKOFF_MINUTES,
  STALE_CLAIM_MINUTES,
} from '../state-machine'
import type { PublishAttempt } from '../types'

const NOW = new Date('2026-09-13T10:00:00.000Z')
const minutesLater = (m: number) =>
  new Date(NOW.getTime() + m * 60_000).toISOString()

function attempts(n: number): PublishAttempt[] {
  return Array.from({ length: n }, (_, i) => ({
    _key: `a${i}`,
    at: NOW.toISOString(),
    outcome: 'transient' as const,
  }))
}

describe('canTransition', () => {
  it.each([
    ['draft', 'scheduled'],
    ['scheduled', 'publishing'],
    ['scheduled', 'awaiting-manual'],
    ['scheduled', 'draft'],
    ['publishing', 'published'],
    ['publishing', 'failed'],
    ['publishing', 'scheduled'],
    ['awaiting-manual', 'published'],
    ['failed', 'scheduled'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
  })

  it.each([
    ['draft', 'publishing'],
    ['draft', 'published'],
    ['published', 'scheduled'],
    ['published', 'draft'],
    ['failed', 'publishing'],
    ['awaiting-manual', 'publishing'],
    ['scheduled', 'published'],
  ] as const)('refuses %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false)
  })
})

describe('canOrganizerTransition — the hand-driven subset', () => {
  it.each([
    ['draft', 'scheduled'],
    ['scheduled', 'draft'],
    ['failed', 'scheduled'],
    ['awaiting-manual', 'published'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canOrganizerTransition(from, to)).toBe(true)
  })

  it('never lets an organizer touch a live publishing claim, even though the engine may re-queue it', () => {
    expect(canTransition('publishing', 'scheduled')).toBe(true)
    expect(canOrganizerTransition('publishing', 'scheduled')).toBe(false)
    expect(canOrganizerTransition('publishing', 'failed')).toBe(false)
  })

  it('never lets an organizer mark a scheduled variant published by hand', () => {
    expect(canOrganizerTransition('scheduled', 'published')).toBe(false)
  })
})

describe('decideAfterPublish — orchestrator retry policy (#788)', () => {
  it('a success lands in published with the result', () => {
    const decision = decideAfterPublish(
      { ok: true, externalId: 'ext-1', url: 'https://bsky.app/x' },
      attempts(0),
      NOW,
    )
    expect(decision).toEqual({
      status: 'published',
      publishResult: { externalId: 'ext-1', url: 'https://bsky.app/x' },
    })
  })

  it('transient on the first attempt re-enters scheduled after 5 minutes', () => {
    const decision = decideAfterPublish(
      { ok: false, kind: 'transient', message: 'timeout before send' },
      attempts(1),
      NOW,
    )
    expect(decision).toEqual({
      status: 'scheduled',
      scheduledAt: minutesLater(RETRY_BACKOFF_MINUTES[0]),
    })
    expect(RETRY_BACKOFF_MINUTES[0]).toBe(5)
  })

  it('backs off 5 → 15 → 45 minutes across attempts', () => {
    expect(RETRY_BACKOFF_MINUTES).toEqual([5, 15, 45])
    const second = decideAfterPublish(
      { ok: false, kind: 'rate-limited', message: '429' },
      attempts(2),
      NOW,
    )
    expect(second).toEqual({
      status: 'scheduled',
      scheduledAt: minutesLater(15),
    })
  })

  it('a later retryAfter from the platform wins over the backoff', () => {
    const decision = decideAfterPublish(
      {
        ok: false,
        kind: 'rate-limited',
        message: '429',
        retryAfter: new Date(NOW.getTime() + 60 * 60_000),
      },
      attempts(1),
      NOW,
    )
    expect(decision).toEqual({
      status: 'scheduled',
      scheduledAt: minutesLater(60),
    })
  })

  it('an earlier retryAfter does not shorten the backoff', () => {
    const decision = decideAfterPublish(
      {
        ok: false,
        kind: 'rate-limited',
        message: '429',
        retryAfter: new Date(NOW.getTime() + 60_000),
      },
      attempts(1),
      NOW,
    )
    expect(decision).toEqual({
      status: 'scheduled',
      scheduledAt: minutesLater(5),
    })
  })

  it(`fails after ${MAX_PUBLISH_ATTEMPTS} attempts even when transient`, () => {
    expect(MAX_PUBLISH_ATTEMPTS).toBe(3)
    const decision = decideAfterPublish(
      { ok: false, kind: 'transient', message: 'still down' },
      attempts(MAX_PUBLISH_ATTEMPTS),
      NOW,
    )
    expect(decision).toEqual({ status: 'failed' })
  })

  it.each(['rejected', 'ambiguous', 'credential-expired'] as const)(
    '%s fails immediately on the first attempt',
    (kind) => {
      const decision = decideAfterPublish(
        { ok: false, kind, message: 'no' },
        attempts(1),
        NOW,
      )
      expect(decision).toEqual({ status: 'failed' })
    },
  )
})

describe('isStaleClaim', () => {
  it(`treats a claim older than ${STALE_CLAIM_MINUTES} minutes as stale`, () => {
    const claimedAt = new Date(
      NOW.getTime() - (STALE_CLAIM_MINUTES + 1) * 60_000,
    ).toISOString()
    expect(isStaleClaim(claimedAt, NOW)).toBe(true)
  })

  it('keeps a fresh claim', () => {
    expect(isStaleClaim(minutesLater(-1), NOW)).toBe(false)
  })

  it('treats a missing claim timestamp as stale — an unknowable claim must not hold the variant forever', () => {
    expect(isStaleClaim(null, NOW)).toBe(true)
  })
})
