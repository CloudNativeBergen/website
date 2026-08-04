import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
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

/** The platform zone under test. Always stubbed — never inherited from `.env`. */
const PLATFORM_SUFFIX = 'konf.run'

afterEach(() => {
  vi.unstubAllEnvs()
})

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

  it('reconciles a platform-owned host to verified with NO failure history', () => {
    const patch = applyCheckOutcome(
      record({
        hostname: 'kubeday.konf.run',
        status: 'failing',
        method: 'dns-txt',
        graceUntil: daysAgo(-5),
        firstFailureAt: daysAgo(9),
        consecutiveFailures: 7,
        consecutiveSoftFailures: 2,
        lastError: 'No TXT record',
      }),
      { kind: 'platform-owned' },
      NOW,
    )
    expect(patch).toMatchObject({
      status: 'verified',
      method: 'platform-owned',
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
    })
    // PERMANENT, not a grace period: the write-back never mints a deadline.
    expect(patch).not.toHaveProperty('graceUntil')
  })
})

/**
 * PLATFORM-OWNED HOSTS. Every assertion here is about the OBSERVABLE grant —
 * does this record route, is it on the redirect allowlist — with no reference to
 * any message or reason string.
 */
describe('platform-owned hosts', () => {
  /** An unproven record: `pending`, never checked, no proof of any kind. */
  function unproven(hostname: string): DomainVerificationRecord {
    return record({
      hostname,
      _id: `domainVerification.${hostname}`,
      status: 'pending',
      method: 'dns-txt',
      verifiedAt: null,
      lastSuccessAt: null,
      lastCheckedAt: null,
    })
  }

  describe('with the platform suffix configured', () => {
    beforeEach(() => {
      vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', PLATFORM_SUFFIX)
    })

    it('ROUTES an unproven subdomain of the platform zone', () => {
      // The whole point: we minted `kubeday.konf.run` and control its DNS, so
      // demanding a TXT record in that zone would only take the tenant offline.
      expect(isRoutingEligible(unproven('kubeday.konf.run'), NOW)).toBe(true)
    })

    it('ALLOWLISTS it as a redirect destination', () => {
      expect(isAllowlistEligible(unproven('kubeday.konf.run'), NOW)).toBe(true)
    })

    it('is PERMANENT — no grace window, no staleness expiry', () => {
      const ancient = unproven('kubeday.konf.run')
      const muchLater = new Date(NOW.getTime() + 3650 * DAY)
      expect(isRoutingEligible(ancient, muchLater)).toBe(true)
      expect(isAllowlistEligible(ancient, muchLater)).toBe(true)
      // …whereas a grandfathered claim of the same age is long gone.
      expect(
        isRoutingEligible(
          record({
            method: 'grandfathered',
            status: 'pending',
            graceUntil: daysAgo(-5),
          }),
          muchLater,
        ),
      ).toBe(false)
    })

    it('survives a long hard-failure streak that would delist any other host', () => {
      const failing = {
        status: 'failing' as const,
        consecutiveFailures: ROUTING_GRACE_FAILURES + 10,
        firstFailureAt: daysAgo(ROUTING_GRACE_DAYS + 30),
      }
      expect(
        isRoutingEligible({ ...unproven('kubeday.konf.run'), ...failing }, NOW),
      ).toBe(true)
      expect(
        isRoutingEligible(
          { ...unproven('kubeday.example.com'), ...failing },
          NOW,
        ),
      ).toBe(false)
    })

    it('REFUSES a released (revoked) platform subdomain', () => {
      // Releasing the claim must remove the grant instantly — platform-owned is
      // permanent, not unconditional.
      const released = {
        ...unproven('kubeday.konf.run'),
        status: 'revoked' as const,
      }
      expect(isRoutingEligible(released, NOW)).toBe(false)
      expect(isAllowlistEligible(released, NOW)).toBe(false)
    })

    it('REFUSES a label-boundary near-miss: evil-konf.run is NOT konf.run', () => {
      expect(isRoutingEligible(unproven('evil-konf.run'), NOW)).toBe(false)
      expect(isAllowlistEligible(unproven('evil-konf.run'), NOW)).toBe(false)
      expect(isRoutingEligible(unproven('sub.evil-konf.run'), NOW)).toBe(false)
    })

    it('REFUSES the platform zone used as a PREFIX: konf.run.attacker.com', () => {
      expect(isRoutingEligible(unproven('konf.run.attacker.com'), NOW)).toBe(
        false,
      )
      expect(isAllowlistEligible(unproven('konf.run.attacker.com'), NOW)).toBe(
        false,
      )
    })

    it('leaves CUSTOM domains exactly as they were — real proof still required', () => {
      // The regression that matters most: turning platform hosts on must not
      // hand a free pass to a tenant's own domain.
      expect(isRoutingEligible(unproven('cloudnativedays.no'), NOW)).toBe(false)
      expect(isAllowlistEligible(unproven('cloudnativedays.no'), NOW)).toBe(
        false,
      )
      // …and a proven one still passes, for the ordinary reason.
      expect(
        isRoutingEligible(record({ hostname: 'cloudnativedays.no' }), NOW),
      ).toBe(true)
    })

    it('REFUSES a WILDCARD claim over the platform zone', () => {
      // `*.konf.run` would route every tenant subdomain for whoever holds it.
      expect(isRoutingEligible(unproven('*.konf.run'), NOW)).toBe(false)
      expect(isAllowlistEligible(unproven('*.konf.run'), NOW)).toBe(false)
    })

    it('REFUSES the platform APEX itself', () => {
      expect(isRoutingEligible(unproven('konf.run'), NOW)).toBe(false)
    })
  })

  describe('with the platform suffix UNSET', () => {
    beforeEach(() => {
      vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
    })

    it('FAILS CLOSED — an unset suffix grants nothing, it does not match all', () => {
      // The inversion that would be catastrophic: "" matching every host would
      // permanently allowlist and route every unproven claim on the platform.
      expect(isRoutingEligible(unproven('kubeday.konf.run'), NOW)).toBe(false)
      expect(isAllowlistEligible(unproven('kubeday.konf.run'), NOW)).toBe(false)
      expect(isRoutingEligible(unproven('anything.example.com'), NOW)).toBe(
        false,
      )
      expect(isAllowlistEligible(unproven('anything.example.com'), NOW)).toBe(
        false,
      )
    })

    it('withdraws the grant from a record that still SAYS platform-owned', () => {
      // The verdict is re-derived from the hostname, never read off the stored
      // `method` — so re-pointing the suffix cannot leave stale grants behind.
      // `pending` with no proof, so the ONLY thing that could grant standing is
      // the platform check itself.
      const stale = {
        ...unproven('kubeday.konf.run'),
        method: 'platform-owned' as const,
      }
      expect(isAllowlistEligible(stale, NOW)).toBe(false)
      expect(isRoutingEligible(stale, NOW)).toBe(false)
    })
  })
})
