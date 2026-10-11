/**
 * @vitest-environment node
 *
 * Where the workshop portal is, for a link that leaves the request (#1298,
 * #1314): the conference's main host, only while it may receive a hand-off.
 *
 * The real destination policy runs (it is proven in `destination.test.ts`).
 * Only the record read is supplied (`getDomainClaim`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DomainClaim } from '@/lib/domain-verification/types'
import {
  claimsById,
  provenClaim,
} from '../../../__tests__/helpers/domainClaims'

const getDomainClaim = vi.fn<(id: string) => Promise<DomainClaim | null>>()
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: (id: string) => getDomainClaim(id),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: vi.fn(),
}))

import { workshopPortalUrl, workshopRequestHost } from './sign-in'

beforeEach(() => {
  getDomainClaim.mockReset()
  getDomainClaim.mockImplementation(claimsById(provenClaim('conf.example.org')))
  vi.stubEnv('NODE_ENV', 'production')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  expect(console.error).not.toHaveBeenCalled()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/**
 * The host a request arrived on is the `Host` header. A forwarded host is
 * client-controlled wherever the edge does not overwrite it, and must never
 * pick the host.
 */
describe('workshopRequestHost', () => {
  it('is the Host header', () => {
    expect(workshopRequestHost(new Headers({ host: 'conf.example.org' }))).toBe(
      'conf.example.org',
    )
  })

  it('ignores x-forwarded-host, forwarded and origin entirely', () => {
    const headers = new Headers({
      host: 'conf.example.org',
      'x-forwarded-host': 'evil.example.org',
      forwarded: 'host=evil.example.org',
      origin: 'https://evil.example.org',
    })
    expect(workshopRequestHost(headers)).toBe('conf.example.org')
  })

  it('is null without a Host header, whatever else is sent', () => {
    expect(
      workshopRequestHost(
        new Headers({ 'x-forwarded-host': 'conf.example.org' }),
      ),
    ).toBeNull()
  })
})

/**
 * The link an attendee is mailed (#1298): the portal on the conference's main
 * host, only while that host can sign in.
 */
describe('workshopPortalUrl', () => {
  const conference = { domains: ['conf.example.org', 'other.example.org'] }

  it('is the portal on the main host when it can sign in', async () => {
    await expect(workshopPortalUrl(conference)).resolves.toBe(
      'https://conf.example.org/workshop',
    )
    expect(getDomainClaim).toHaveBeenCalledOnce()
  })

  it('is there for a tenant’s own proven domain, whoever owns the conference', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    getDomainClaim.mockImplementation(
      claimsById(
        provenClaim(
          'conf.example.org',
          { method: 'dns-txt' },
          { organization: { _ref: 'org-of-the-tenant' } },
        ),
      ),
    )

    await expect(workshopPortalUrl(conference)).resolves.toBe(
      'https://conf.example.org/workshop',
    )
  })

  it('does not depend on WORKOS_COOKIE_DOMAIN', async () => {
    vi.stubEnv('WORKOS_COOKIE_DOMAIN', 'example.org')

    await expect(workshopPortalUrl(conference)).resolves.toBe(
      'https://conf.example.org/workshop',
    )
  })

  it('is null when the main host cannot sign in, even if another can', async () => {
    getDomainClaim.mockImplementation(
      claimsById(provenClaim('other.example.org')),
    )

    await expect(workshopPortalUrl(conference)).resolves.toBeNull()
  })

  it('is null while the main host is only grandfathered', async () => {
    getDomainClaim.mockImplementation(
      claimsById(
        provenClaim('conf.example.org', {
          method: 'grandfathered',
          graceUntil: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    )

    await expect(workshopPortalUrl(conference)).resolves.toBeNull()
  })

  it('is null for a conference with no domain, never the platform fallback host, and reads nothing', async () => {
    for (const domains of [[], undefined, null, ['']]) {
      await expect(
        workshopPortalUrl({ title: 'No Domain', domains }),
      ).resolves.toBeNull()
    }
    expect(getDomainClaim).not.toHaveBeenCalled()
  })
})
