import { describe, it, expect } from 'vitest'
import {
  CONFIRM_TIMEOUT_MINUTES,
  MAX_PUBLISH_ATTEMPTS,
  RETRY_BACKOFF_MINUTES,
  STALE_CLAIM_MINUTES,
  canOrganizerTransition,
  canTransition,
  confirmIntervalMs,
  decideAfterConfirm,
  decideAfterPublish,
  isConfirmDue,
  isConfirmTimedOut,
  isStaleClaim,
  mayAlreadyBeLive,
} from '../state-machine'
import type { AttemptOutcome, VariantStatus } from '../types'

const NOW = new Date('2026-09-13T10:00:00.000Z')
const minutesLater = (m: number) =>
  new Date(NOW.getTime() + m * 60_000).toISOString()

describe('canTransition', () => {
  it.each([
    ['draft', 'scheduled'],
    ['scheduled', 'publishing'],
    ['scheduled', 'awaiting-manual'],
    ['scheduled', 'draft'],
    ['publishing', 'published'],
    ['publishing', 'failed'],
    ['publishing', 'scheduled'],
    ['publishing', 'awaiting-manual'],
    ['publishing', 'submitted'],
    ['submitted', 'published'],
    ['submitted', 'failed'],
    ['awaiting-manual', 'published'],
    ['failed', 'scheduled'],
    ['failed', 'published'],
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
    ['scheduled', 'submitted'],
    ['submitted', 'scheduled'],
    ['submitted', 'draft'],
    ['submitted', 'publishing'],
    ['submitted', 'awaiting-manual'],
    ['published', 'submitted'],
    ['failed', 'submitted'],
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
    ['failed', 'published'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canOrganizerTransition(from, to)).toBe(true)
  })

  it.each(['published', 'failed', 'scheduled', 'draft'] as const)(
    'never lets an organizer drive a submitted variant to %s — only the confirm sweep settles it',
    (to) => {
      expect(canOrganizerTransition('submitted', to)).toBe(false)
    },
  )

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
      0,
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
      1,
      NOW,
    )
    expect(decision).toEqual({
      status: 'scheduled',
      scheduledAt: minutesLater(RETRY_BACKOFF_MINUTES[0]),
    })
    expect(RETRY_BACKOFF_MINUTES[0]).toBe(5)
  })

  it('backs off 5 → 15 minutes across the two re-queues a 3-attempt cap allows', () => {
    expect(RETRY_BACKOFF_MINUTES).toEqual([5, 15])
    const second = decideAfterPublish(
      { ok: false, kind: 'rate-limited', message: '429' },
      2,
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
      1,
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
      1,
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
      MAX_PUBLISH_ATTEMPTS,
      NOW,
    )
    expect(decision).toEqual({ status: 'failed' })
  })

  it.each(['rejected', 'ambiguous', 'credential-expired'] as const)(
    '%s fails immediately on the first attempt',
    (kind) => {
      const decision = decideAfterPublish(
        { ok: false, kind, message: 'no' },
        1,
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

describe('decideAfterPublish — an ACCEPTED outcome (#1128)', () => {
  it('lands in submitted carrying the vendor post id, never in publishResult', () => {
    const decision = decideAfterPublish(
      { ok: true, result: 'accepted', vendorPostId: 'buffer-1' },
      1,
      NOW,
    )
    expect(decision).toEqual({
      status: 'submitted',
      submission: {
        vendorPostId: 'buffer-1',
        submittedAt: NOW.toISOString(),
        lastCheckedAt: null,
      },
    })
    expect(decision).not.toHaveProperty('publishResult')
  })

  it('accepts on the LAST allowed attempt too — acceptance is not a retryable failure', () => {
    const decision = decideAfterPublish(
      { ok: true, result: 'accepted', vendorPostId: 'buffer-2' },
      MAX_PUBLISH_ATTEMPTS,
      NOW,
    )
    expect(decision.status).toBe('submitted')
  })
})

describe('decideAfterConfirm — the confirm sweep (#1128)', () => {
  const submittedAt = minutesLater(-1)

  it('a sent post is published, and the vendor ids land in publishResult', () => {
    expect(
      decideAfterConfirm(
        {
          state: 'published',
          externalId: 'urn:li:share:7',
          url: 'https://linkedin.com/x',
        },
        submittedAt,
        NOW,
      ),
    ).toEqual({
      status: 'published',
      publishResult: {
        externalId: 'urn:li:share:7',
        url: 'https://linkedin.com/x',
      },
    })
  })

  it('a vendor-reported error is terminal and carries its message — never a retry', () => {
    expect(
      decideAfterConfirm(
        { state: 'failed', message: 'LinkedIn rejected the post' },
        submittedAt,
        NOW,
      ),
    ).toEqual({
      status: 'failed',
      outcome: 'rejected',
      message: 'LinkedIn rejected the post',
    })
  })

  it('a post gone from the vendor is AMBIGUOUS, not rejected — it may have gone out', () => {
    const decision = decideAfterConfirm({ state: 'gone' }, submittedAt, NOW)
    expect(decision).toMatchObject({ status: 'failed', outcome: 'ambiguous' })
  })

  it('stays pending while the vendor has not settled and the timeout has not passed', () => {
    expect(decideAfterConfirm({ state: 'pending' }, submittedAt, NOW)).toEqual({
      status: 'pending',
    })
  })

  it('a read we could not make stays pending inside the window', () => {
    expect(
      decideAfterConfirm(
        { state: 'unreadable', message: 'vendor timeout' },
        submittedAt,
        NOW,
      ),
    ).toEqual({ status: 'pending' })
  })

  it.each(['pending', 'unreadable'] as const)(
    `%s past ${CONFIRM_TIMEOUT_MINUTES} minutes is failed as ambiguous — never re-posted`,
    (state) => {
      const decision = decideAfterConfirm(
        state === 'pending'
          ? { state: 'pending' }
          : { state: 'unreadable', message: 'vendor timeout' },
        minutesLater(-(CONFIRM_TIMEOUT_MINUTES + 1)),
        NOW,
      )
      expect(decision).toMatchObject({ status: 'failed', outcome: 'ambiguous' })
    },
  )

  it('a settled answer past the timeout still wins over the timeout', () => {
    expect(
      decideAfterConfirm(
        { state: 'published', externalId: 'urn:li:share:9' },
        minutesLater(-(CONFIRM_TIMEOUT_MINUTES + 10)),
        NOW,
      ),
    ).toMatchObject({ status: 'published' })
  })
})

describe('confirm polling cadence (#1128)', () => {
  it('reads first ~30 s after the submit, then backs off', () => {
    expect(confirmIntervalMs(0)).toBe(30_000)
    expect(confirmIntervalMs(3 * 60_000)).toBeGreaterThan(30_000)
    expect(confirmIntervalMs(10 * 60_000)).toBeGreaterThan(
      confirmIntervalMs(3 * 60_000),
    )
  })

  it('is not due 10 s after the submit, and is due 31 s after it', () => {
    const at = (s: number) => new Date(NOW.getTime() + s * 1000)
    const submission = {
      vendorPostId: 'b1',
      submittedAt: NOW.toISOString(),
      lastCheckedAt: null,
    }
    expect(isConfirmDue(submission, at(10))).toBe(false)
    expect(isConfirmDue(submission, at(31))).toBe(true)
  })

  it('counts from the LAST check once one has been made', () => {
    const at = (s: number) => new Date(NOW.getTime() + s * 1000)
    const submission = {
      vendorPostId: 'b1',
      submittedAt: NOW.toISOString(),
      lastCheckedAt: at(31).toISOString(),
    }
    expect(isConfirmDue(submission, at(40))).toBe(false)
    expect(isConfirmDue(submission, at(65))).toBe(true)
  })

  it('an unparseable submittedAt is due AND timed out — an unknowable submission must not hang forever', () => {
    expect(
      isConfirmDue(
        { vendorPostId: 'b1', submittedAt: 'nonsense', lastCheckedAt: null },
        NOW,
      ),
    ).toBe(true)
    expect(isConfirmTimedOut('nonsense', NOW)).toBe(true)
    expect(isConfirmTimedOut(null, NOW)).toBe(true)
  })

  it(`times out after ${CONFIRM_TIMEOUT_MINUTES} minutes, not before`, () => {
    expect(
      isConfirmTimedOut(minutesLater(-(CONFIRM_TIMEOUT_MINUTES - 1)), NOW),
    ).toBe(false)
    expect(
      isConfirmTimedOut(minutesLater(-(CONFIRM_TIMEOUT_MINUTES + 1)), NOW),
    ).toBe(true)
  })
})

describe('mayAlreadyBeLive — which failures must not be retried blind (#1128)', () => {
  const v = (status: VariantStatus, ...outcomes: AttemptOutcome[]) => ({
    status,
    attempts: outcomes.map((outcome, i) => ({
      _key: `a${i}`,
      at: '2026-09-13T09:00:00.000Z',
      outcome,
    })),
  })

  it.each(['ambiguous', 'stale-claim'] as const)(
    'is TRUE after %s — the post may be on the platform already',
    (outcome) => {
      expect(mayAlreadyBeLive(v('failed', 'submitted', outcome))).toBe(true)
    },
  )

  it.each([
    'rejected',
    'credential-expired',
    'rate-limited',
    'transient',
  ] as const)(
    'is FALSE after %s — the publisher created nothing',
    (outcome) => {
      // The CONTROL for the two above. If every failure warned, the warning
      // would be noise and an organizer would learn to click through it.
      expect(mayAlreadyBeLive(v('failed', outcome))).toBe(false)
    },
  )

  it('reads the LAST attempt, not any attempt', () => {
    // An ambiguous attempt that a later one settled is settled. The outcome
    // the organizer is looking at now is what decides what they are told.
    expect(mayAlreadyBeLive(v('failed', 'ambiguous', 'rejected'))).toBe(false)
  })

  it('is FALSE for a variant that is not failed at all', () => {
    expect(mayAlreadyBeLive(v('published', 'ambiguous'))).toBe(false)
    expect(mayAlreadyBeLive(v('awaiting-manual'))).toBe(false)
  })

  it('is FALSE when there are no attempts', () => {
    expect(mayAlreadyBeLive(v('failed'))).toBe(false)
  })
})
