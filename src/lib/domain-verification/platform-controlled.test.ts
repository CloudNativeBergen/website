import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isPlatformControlledHost } from './platform-controlled'
import { isAllowlistEligible } from './policy'
import type { DomainVerificationRecord } from './types'

const NOW = new Date('2026-07-01T12:00:00.000Z')
const PLATFORM_ORG = 'org-platform'
const TENANT_ORG = 'org-tenant'

function record(
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  return {
    _id: 'domainVerification.x',
    hostname: 'conf.example.org',
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'verified',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: '2026-06-01T00:00:00.000Z',
    lastSuccessAt: '2026-06-30T00:00:00.000Z',
    lastCheckedAt: '2026-06-30T00:00:00.000Z',
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG)
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isPlatformControlledHost', () => {
  it('admits a host the platform allocated, whoever owns the conference', () => {
    const allocated = record({
      hostname: 'tenant.konf.run',
      method: 'platform-owned',
    })
    expect(isPlatformControlledHost(allocated, TENANT_ORG, NOW)).toBe(true)
  })

  it('admits a verified custom domain of the platform organization', () => {
    expect(isPlatformControlledHost(record(), PLATFORM_ORG, NOW)).toBe(true)
  })

  it('refuses a verified custom domain of any other organization', () => {
    expect(isPlatformControlledHost(record(), TENANT_ORG, NOW)).toBe(false)
  })

  it('refuses a platform-organization host whose proof never resolved', () => {
    const pending = record({ status: 'pending', lastSuccessAt: null })
    expect(isPlatformControlledHost(pending, PLATFORM_ORG, NOW)).toBe(false)
  })

  it('refuses a platform-organization host that is only grandfathered, never proven', () => {
    const grandfathered = record({
      method: 'grandfathered',
      graceUntil: '2026-07-15T00:00:00.000Z',
    })
    // On the redirect allowlist for the grace period, which is the trap.
    expect(isAllowlistEligible(grandfathered, NOW)).toBe(true)
    expect(isPlatformControlledHost(grandfathered, PLATFORM_ORG, NOW)).toBe(
      false,
    )
  })

  it('refuses a platform-organization allocation from a suffix the platform no longer has', () => {
    const stale = record({
      hostname: 'old.former-suffix.org',
      method: 'platform-owned',
    })
    // Recently "verified" by the allocation itself, so the allowlist admits it.
    expect(isAllowlistEligible(stale, NOW)).toBe(true)
    expect(isPlatformControlledHost(stale, PLATFORM_ORG, NOW)).toBe(false)
  })

  it('refuses a platform-organization host whose proof has gone stale', () => {
    // Guard a mutation pass found unpinned (#1297 review): the answer depends
    // on `now`. Proven once, last confirmed 61 days before NOW.
    const stale = record({ lastSuccessAt: '2026-05-01T00:00:00.000Z' })
    expect(isPlatformControlledHost(stale, PLATFORM_ORG, NOW)).toBe(false)
    // The same record, asked while the proof was fresh.
    expect(
      isPlatformControlledHost(
        stale,
        PLATFORM_ORG,
        new Date('2026-05-15T00:00:00.000Z'),
      ),
    ).toBe(true)
  })

  it('refuses a released allocation', () => {
    const released = record({
      hostname: 'tenant.konf.run',
      method: 'platform-owned',
      status: 'revoked',
    })
    expect(isPlatformControlledHost(released, PLATFORM_ORG, NOW)).toBe(false)
  })

  it('refuses a wildcard claim, even a verified one of the platform organization', () => {
    const wildcard = record({ hostname: '*.example.org' })
    expect(isPlatformControlledHost(wildcard, PLATFORM_ORG, NOW)).toBe(false)
  })

  it('refuses every custom domain when no platform organization is configured', () => {
    vi.stubEnv('PLATFORM_ORG_ID', '')
    expect(isPlatformControlledHost(record(), '', NOW)).toBe(false)
    expect(isPlatformControlledHost(record(), null, NOW)).toBe(false)
    expect(isPlatformControlledHost(record(), undefined, NOW)).toBe(false)
  })
})
