import { describe, it, expect } from 'vitest'
import {
  ALLOWLIST_MAX_STALENESS_DAYS,
  ROUTING_GRACE_DAYS,
  ROUTING_GRACE_FAILURES,
  SOFT_FAILURE_ESCALATION,
  applyCheckOutcome,
  isAllowlistEligible,
  isRoutingEligible,
} from './policy'
import type { DomainVerificationRecord } from './types'

const NOW = new Date('2026-07-01T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString()
}

function record(
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  return {
    _id: 'domainVerification.example.com',
    hostname: 'example.com',
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'verified',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: daysAgo(100),
    lastSuccessAt: daysAgo(1),
    lastCheckedAt: daysAgo(1),
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
    ...overrides,
  }
}

describe('isAllowlistEligible', () => {
  it('accepts a freshly verified exact host', () => {
    expect(isAllowlistEligible(record(), NOW)).toBe(true)
  })

  it('REFUSES a claimed but never-proven host', () => {
    // The core of #683: uniqueness is not ownership. A `pending` claim is an
    // authorization-redirect grant nobody proved they were entitled to.
    expect(
      isAllowlistEligible(
        record({ status: 'pending', lastSuccessAt: null }),
        NOW,
      ),
    ).toBe(false)
  })

  it('REFUSES the instant the proof stops resolving — no grace at all', () => {
    expect(
      isAllowlistEligible(
        record({
          status: 'failing',
          firstFailureAt: daysAgo(0),
          consecutiveFailures: 1,
        }),
        NOW,
      ),
    ).toBe(false)
  })

  it('REFUSES a wildcard claim even when its base zone is fully proven', () => {
    // Routing deliberately serves `sub.example.com` from a `*.example.com`
    // claim. The redirect allowlist must NOT inherit that: prefix/wildcard
    // redirect matching is the canonical code-exfiltration chain (RFC 9700).
    expect(
      isAllowlistEligible(record({ hostname: '*.example.com' }), NOW),
    ).toBe(false)
  })

  it('REFUSES dev-only hosts, which can never carry a public proof', () => {
    expect(
      isAllowlistEligible(record({ hostname: 'localhost:3000' }), NOW),
    ).toBe(false)
  })

  it('EXPIRES a verified host whose proof has not been re-checked recently', () => {
    // Guards against the checker being silently broken: a stale success must
    // not keep the allowlist "fresh" indefinitely.
    expect(
      isAllowlistEligible(
        record({ lastSuccessAt: daysAgo(ALLOWLIST_MAX_STALENESS_DAYS + 1) }),
        NOW,
      ),
    ).toBe(false)
    expect(
      isAllowlistEligible(
        record({ lastSuccessAt: daysAgo(ALLOWLIST_MAX_STALENESS_DAYS - 1) }),
        NOW,
      ),
    ).toBe(true)
  })

  it('honours a grandfathered claim only inside its window', () => {
    const inGrace = record({
      method: 'grandfathered',
      status: 'failing',
      graceUntil: new Date(NOW.getTime() + 5 * DAY).toISOString(),
    })
    expect(isAllowlistEligible(inGrace, NOW)).toBe(true)
    expect(
      isAllowlistEligible(
        { ...inGrace, graceUntil: new Date(NOW.getTime() - DAY).toISOString() },
        NOW,
      ),
    ).toBe(false)
  })
})

describe('isRoutingEligible', () => {
  it('serves a verified host', () => {
    expect(isRoutingEligible(record(), NOW)).toBe(true)
  })

  it('refuses a claimed but unproven host', () => {
    expect(isRoutingEligible(record({ status: 'pending' }), NOW)).toBe(false)
  })

  it('keeps serving a stale-but-verified host', () => {
    // Our checker not having run is our problem; taking a customer's public
    // site down over it is strictly worse than continuing to serve it.
    expect(
      isRoutingEligible(record({ lastSuccessAt: daysAgo(365) }), NOW),
    ).toBe(true)
  })

  it('does NOT withdraw routing on a short failure streak', () => {
    expect(
      isRoutingEligible(
        record({
          status: 'failing',
          consecutiveFailures: ROUTING_GRACE_FAILURES,
          firstFailureAt: daysAgo(ROUTING_GRACE_DAYS - 1),
        }),
        NOW,
      ),
    ).toBe(true)
  })

  it('does NOT withdraw routing when the streak is long but shallow', () => {
    expect(
      isRoutingEligible(
        record({
          status: 'failing',
          consecutiveFailures: ROUTING_GRACE_FAILURES - 1,
          firstFailureAt: daysAgo(ROUTING_GRACE_DAYS + 30),
        }),
        NOW,
      ),
    ).toBe(true)
  })

  it('withdraws routing only when BOTH thresholds are exceeded', () => {
    expect(
      isRoutingEligible(
        record({
          status: 'failing',
          consecutiveFailures: ROUTING_GRACE_FAILURES,
          firstFailureAt: daysAgo(ROUTING_GRACE_DAYS),
        }),
        NOW,
      ),
    ).toBe(false)
  })

  it('always serves dev-only entries so local development keeps working', () => {
    expect(
      isRoutingEligible(
        record({ hostname: 'localhost:3000', status: 'pending' }),
        NOW,
      ),
    ).toBe(true)
  })

  it('never serves a revoked claim', () => {
    expect(isRoutingEligible(record({ status: 'revoked' }), NOW)).toBe(false)
  })
})

describe('applyCheckOutcome', () => {
  it('clears the whole failure history on a successful proof', () => {
    const patch = applyCheckOutcome(
      record({
        status: 'failing',
        method: 'grandfathered',
        graceUntil: daysAgo(-5),
        firstFailureAt: daysAgo(3),
        consecutiveFailures: 2,
        consecutiveSoftFailures: 1,
        lastError: 'boom',
      }),
      { kind: 'verified' },
      NOW,
    )
    expect(patch).toMatchObject({
      status: 'verified',
      // A real proof retires the grandfathered exemption for good.
      method: 'dns-txt',
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
      lastSuccessAt: NOW.toISOString(),
    })
  })

  it('keeps the ORIGINAL verifiedAt across re-verifications', () => {
    const patch = applyCheckOutcome(
      record({ verifiedAt: daysAgo(200) }),
      { kind: 'verified' },
      NOW,
    )
    expect(patch.verifiedAt).toBe(daysAgo(200))
  })

  it('marks a hard failure failing immediately and starts the routing clock', () => {
    const patch = applyCheckOutcome(
      record(),
      { kind: 'hard-failure', reason: 'No TXT record' },
      NOW,
    )
    expect(patch).toMatchObject({
      status: 'failing',
      firstFailureAt: NOW.toISOString(),
      consecutiveFailures: 1,
    })
  })

  it('does NOT restart the routing clock on a continuing streak', () => {
    const patch = applyCheckOutcome(
      record({
        status: 'failing',
        firstFailureAt: daysAgo(4),
        consecutiveFailures: 2,
      }),
      { kind: 'hard-failure', reason: 'still gone' },
      NOW,
    )
    expect(patch.firstFailureAt).toBe(daysAgo(4))
    expect(patch.consecutiveFailures).toBe(3)
  })

  it('leaves status untouched on a transient resolver failure', () => {
    // The single most important non-obvious rule: a DNS blip must not delist.
    const patch = applyCheckOutcome(
      record(),
      { kind: 'soft-failure', reason: 'DNS lookup failed (ETIMEOUT)' },
      NOW,
    )
    expect(patch.status).toBeUndefined()
    expect(patch.firstFailureAt).toBeUndefined()
    expect(patch.consecutiveFailures).toBeUndefined()
    expect(patch.consecutiveSoftFailures).toBe(1)
    // …and the record therefore stays on the allowlist.
    expect(isAllowlistEligible({ ...record(), ...patch }, NOW)).toBe(true)
  })

  it('escalates a PERSISTENT resolver outage to a hard failure', () => {
    const patch = applyCheckOutcome(
      record({ consecutiveSoftFailures: SOFT_FAILURE_ESCALATION - 1 }),
      { kind: 'soft-failure', reason: 'DNS lookup failed (ESERVFAIL)' },
      NOW,
    )
    expect(patch.status).toBe('failing')
    expect(patch.consecutiveFailures).toBe(1)
  })

  it('records an unverifiable entry without punishing it', () => {
    const patch = applyCheckOutcome(
      record({ hostname: 'localhost:3000', status: 'pending' }),
      { kind: 'unverifiable', reason: 'Not a public DNS name' },
      NOW,
    )
    expect(patch.status).toBeUndefined()
    expect(patch.consecutiveFailures).toBeUndefined()
    expect(patch.lastCheckedAt).toBe(NOW.toISOString())
  })

  it('never resurrects a revoked record', () => {
    expect(
      applyCheckOutcome(
        record({ status: 'revoked' }),
        { kind: 'verified' },
        NOW,
      ),
    ).toEqual({})
  })
})
