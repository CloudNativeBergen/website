import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toDomainVerificationView } from './view'
import type { DomainVerificationRecord } from './types'

/**
 * The admin card's view model. It is a SECURITY SURFACE as much as a display
 * one: it is what tells an organizer whether a hostname is trusted, and what (if
 * anything) they still have to publish. Announcing "provided by the platform"
 * for a host the platform never issued — or for a claim that has been released —
 * is how a hijack looks legitimate to the person best placed to notice it.
 */

const NOW = new Date('2026-07-01T12:00:00.000Z')

function record(
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  return {
    _id: 'domainVerification.kubeday.konf.run',
    hostname: 'kubeday.konf.run',
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'verified',
    method: 'platform-owned',
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
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('toDomainVerificationView — platform allocations', () => {
  it('marks an allocated host as platform-provided, with no challenge to publish', () => {
    const view = toDomainVerificationView('kubeday.konf.run', record(), NOW)
    expect(view.platformOwned).toBe(true)
    expect(view.routable).toBe(true)
    expect(view.redirectAllowlisted).toBe(true)
    // Nothing to publish, and no deadline to publish it by.
    expect(view.recordName).toBeNull()
    expect(view.recordValue).toBeNull()
    expect(view.graceUntil).toBeNull()
  })

  it('does NOT announce an in-zone host the platform never allocated', () => {
    // An organizer's grab must look exactly like what it is: an unverified
    // claim, with the ordinary DNS challenge shown.
    const view = toDomainVerificationView(
      'some-other-tenant.konf.run',
      record({
        hostname: 'some-other-tenant.konf.run',
        method: 'dns-txt',
        status: 'pending',
      }),
      NOW,
    )
    expect(view.platformOwned).toBe(false)
    expect(view.routable).toBe(false)
    expect(view.redirectAllowlisted).toBe(false)
    expect(view.status).toBe('pending')
    expect(view.recordName).toBe('_konf-challenge.some-other-tenant.konf.run')
  })

  it('does NOT announce an in-zone host with NO record at all', () => {
    const view = toDomainVerificationView('grabbed.konf.run', null, NOW)
    expect(view.platformOwned).toBe(false)
    expect(view.routable).toBe(false)
    expect(view.status).toBe('pending')
  })

  it('REVOKED wins: a released allocation is neither provided nor routable', () => {
    // Revocation is the remedy when a host ends up with the wrong tenant, so the
    // card must stop vouching for it the moment the claim is released.
    const view = toDomainVerificationView(
      'kubeday.konf.run',
      record({ status: 'revoked' }),
      NOW,
    )
    expect(view.platformOwned).toBe(false)
    expect(view.routable).toBe(false)
    expect(view.redirectAllowlisted).toBe(false)
    expect(view.status).toBe('revoked')
  })

  it('does NOT announce a label-boundary near-miss as platform-provided', () => {
    const view = toDomainVerificationView(
      'evil-konf.run',
      record({ hostname: 'evil-konf.run', status: 'pending' }),
      NOW,
    )
    expect(view.platformOwned).toBe(false)
    expect(view.routable).toBe(false)
  })

  it('leaves a CUSTOM domain showing its DNS challenge', () => {
    const view = toDomainVerificationView(
      'cloudnativedays.no',
      record({
        _id: 'domainVerification.cloudnativedays.no',
        hostname: 'cloudnativedays.no',
        method: 'dns-txt',
      }),
      NOW,
    )
    expect(view.platformOwned).toBe(false)
    expect(view.recordName).toBe('_konf-challenge.cloudnativedays.no')
    expect(view.recordValue).toContain('konf-domain-verification=')
  })

  it('drops the announcement when the suffix is unset', () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
    const view = toDomainVerificationView(
      'kubeday.konf.run',
      record({ status: 'pending' }),
      NOW,
    )
    expect(view.platformOwned).toBe(false)
    expect(view.routable).toBe(false)
  })
})
