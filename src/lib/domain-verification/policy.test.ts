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
  })

  it('CLEARS a grandfathered deadline when the host becomes platform-owned', () => {
    // A record grandfathered by the backfill and allocated afterwards still
    // carries a 30-day `graceUntil`. A platform allocation has no deadline, so
    // leaving it would expire a grant that is supposed to be permanent — and
    // `null` is what `patchDomainVerification` turns into an `unset`.
    const grandfatheredThenAllocated = record({
      hostname: 'kubeday.konf.run',
      method: 'grandfathered',
      graceUntil: new Date(NOW.getTime() + 5 * DAY).toISOString(),
    })
    const patch = applyCheckOutcome(
      grandfatheredThenAllocated,
      { kind: 'platform-owned' },
      NOW,
    )
    // The STORED record ends up with no deadline at all. (`sweep.test.ts` and
    // `sanity.test.ts` assert the same thing end-to-end: the patch reaches
    // Sanity as an `unset`.)
    expect({ ...grandfatheredThenAllocated, ...patch }.graceUntil).toBeNull()
  })
})

/**
 * PLATFORM-ALLOCATED HOSTS. Every assertion here is about the OBSERVABLE grant —
 * does this record route, is it on the redirect allowlist — with no reference to
 * any message or reason string.
 *
 * The distinction the whole feature turns on: `allocated()` is a host the
 * PLATFORM granted, `inZoneOnly()` is a host an organizer typed that merely
 * happens to sit under the suffix. The first is verified; the second must be
 * treated exactly like any other unproven claim.
 */
describe('platform-allocated hosts', () => {
  /** An unproven record: `pending`, never checked, no proof of any kind. */
  function inZoneOnly(hostname: string): DomainVerificationRecord {
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

  /**
   * The same claim with the platform's allocation recorded on it. Deliberately
   * left `pending` with no proof of any kind, so the ONLY thing that could grant
   * it standing is the allocation itself — a `verified` fixture would pass these
   * assertions even with the platform rule deleted.
   */
  function allocated(hostname: string): DomainVerificationRecord {
    return { ...inZoneOnly(hostname), method: 'platform-owned' }
  }

  describe('with the platform suffix configured', () => {
    beforeEach(() => {
      vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', PLATFORM_SUFFIX)
    })

    it('ROUTES a subdomain the platform ALLOCATED, with no DNS proof', () => {
      // The whole point: we minted `kubeday.konf.run` and control its DNS, so
      // demanding a TXT record in that zone would only take the tenant offline.
      expect(isRoutingEligible(allocated('kubeday.konf.run'), NOW)).toBe(true)
    })

    it('ALLOWLISTS an allocated host as a redirect destination', () => {
      expect(isAllowlistEligible(allocated('kubeday.konf.run'), NOW)).toBe(true)
    })

    it('REFUSES an UNALLOCATED host that merely sits in the platform zone', () => {
      // THE HIJACK: an organizer types `some-other-tenant.konf.run` into their
      // own settings. Being in our zone says nothing about who is entitled to
      // it, so this must be as unrouted and unallowlisted as any other unproven
      // claim.
      const grabbed = inZoneOnly('some-other-tenant.konf.run')
      expect(isRoutingEligible(grabbed, NOW)).toBe(false)
      expect(isAllowlistEligible(grabbed, NOW)).toBe(false)
    })

    it('REFUSES an in-zone host that a tenant merely got VERIFIED by DNS', () => {
      // Even a genuinely `verified` dns-txt record is not an allocation, so it
      // cannot carry the permanent standing…
      const verified = {
        ...inZoneOnly('kubeday.konf.run'),
        status: 'verified' as const,
        lastSuccessAt: daysAgo(1),
      }
      expect(isAllowlistEligible(verified, NOW)).toBe(true) // ordinary route in
      // …and it expires on staleness like any other dns-txt proof, which an
      // allocation never does.
      const stale = {
        ...verified,
        lastSuccessAt: daysAgo(ALLOWLIST_MAX_STALENESS_DAYS + 1),
      }
      expect(isAllowlistEligible(stale, NOW)).toBe(false)
      expect(
        isAllowlistEligible(
          { ...allocated('kubeday.konf.run'), lastSuccessAt: daysAgo(400) },
          NOW,
        ),
      ).toBe(true)
    })

    it('is PERMANENT — no grace window, no staleness expiry', () => {
      const ancient = allocated('kubeday.konf.run')
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
        isRoutingEligible(
          { ...allocated('kubeday.konf.run'), ...failing },
          NOW,
        ),
      ).toBe(true)
      expect(
        isRoutingEligible(
          { ...allocated('kubeday.example.com'), ...failing },
          NOW,
        ),
      ).toBe(false)
    })

    it('REFUSES a released (revoked) allocated subdomain', () => {
      // Revoked WINS over the allocation, in both consumers. Releasing the claim
      // is the remedy if a host ever ends up with the wrong tenant, so it has to
      // actually undo the grant.
      const released = {
        ...allocated('kubeday.konf.run'),
        status: 'revoked' as const,
      }
      expect(isRoutingEligible(released, NOW)).toBe(false)
      expect(isAllowlistEligible(released, NOW)).toBe(false)
    })

    it('REFUSES a label-boundary near-miss: evil-konf.run is NOT konf.run', () => {
      // Allocated on paper, but the hostname is outside our zone: the live
      // suffix re-check is what stops a mis-issued record from granting.
      expect(isRoutingEligible(allocated('evil-konf.run'), NOW)).toBe(false)
      expect(isAllowlistEligible(allocated('evil-konf.run'), NOW)).toBe(false)
      expect(isRoutingEligible(allocated('sub.evil-konf.run'), NOW)).toBe(false)
    })

    it('REFUSES the platform zone used as a PREFIX: konf.run.attacker.com', () => {
      expect(isRoutingEligible(allocated('konf.run.attacker.com'), NOW)).toBe(
        false,
      )
      expect(isAllowlistEligible(allocated('konf.run.attacker.com'), NOW)).toBe(
        false,
      )
    })

    it('leaves CUSTOM domains exactly as they were — real proof still required', () => {
      // The regression that matters most: turning platform hosts on must not
      // hand a free pass to a tenant's own domain — even one whose record was
      // somehow stamped `platform-owned`.
      expect(isRoutingEligible(inZoneOnly('cloudnativedays.no'), NOW)).toBe(
        false,
      )
      expect(isAllowlistEligible(inZoneOnly('cloudnativedays.no'), NOW)).toBe(
        false,
      )
      expect(isRoutingEligible(allocated('cloudnativedays.no'), NOW)).toBe(
        false,
      )
      expect(isAllowlistEligible(allocated('cloudnativedays.no'), NOW)).toBe(
        false,
      )
      // …and a proven one still passes, for the ordinary reason.
      expect(
        isRoutingEligible(record({ hostname: 'cloudnativedays.no' }), NOW),
      ).toBe(true)
    })

    it('REFUSES a WILDCARD claim over the platform zone', () => {
      // `*.konf.run` would route every tenant subdomain for whoever holds it.
      expect(isRoutingEligible(allocated('*.konf.run'), NOW)).toBe(false)
      expect(isAllowlistEligible(allocated('*.konf.run'), NOW)).toBe(false)
    })

    it('REFUSES the platform APEX itself', () => {
      expect(isRoutingEligible(allocated('konf.run'), NOW)).toBe(false)
    })
  })

  describe('with the platform suffix UNSET', () => {
    beforeEach(() => {
      vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
    })

    it('FAILS CLOSED — an unset suffix grants nothing, it does not match all', () => {
      // The inversion that would be catastrophic: "" matching every host would
      // permanently allowlist and route every unproven claim on the platform.
      expect(isRoutingEligible(inZoneOnly('kubeday.konf.run'), NOW)).toBe(false)
      expect(isAllowlistEligible(inZoneOnly('kubeday.konf.run'), NOW)).toBe(
        false,
      )
      expect(isRoutingEligible(inZoneOnly('anything.example.com'), NOW)).toBe(
        false,
      )
      expect(isAllowlistEligible(inZoneOnly('anything.example.com'), NOW)).toBe(
        false,
      )
    })

    it('withdraws the grant from a record that still SAYS platform-owned', () => {
      // The allocation is re-checked against the LIVE suffix, so re-pointing or
      // unsetting it cannot leave stale grants behind. `pending` with no proof,
      // so the only thing that could grant standing is the allocation.
      const stale = {
        ...inZoneOnly('kubeday.konf.run'),
        method: 'platform-owned' as const,
      }
      expect(isAllowlistEligible(stale, NOW)).toBe(false)
      expect(isRoutingEligible(stale, NOW)).toBe(false)
    })
  })
})
