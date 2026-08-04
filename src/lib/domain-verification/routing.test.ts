import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DomainVerificationRecord } from './types'

const getDomainVerification =
  vi.fn<(hostname: string) => Promise<DomainVerificationRecord | null>>()

vi.mock('./sanity', () => ({
  getDomainVerification: (hostname: string) => getDomainVerification(hostname),
}))

const { isHostRoutable } = await import('./routing')

const NOW = new Date('2026-07-01T12:00:00.000Z')

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
  getDomainVerification.mockReset()
  process.env.DOMAIN_VERIFICATION_ENFORCE_ROUTING = 'true'
})

afterEach(() => {
  delete process.env.DOMAIN_VERIFICATION_ENFORCE_ROUTING
  vi.unstubAllEnvs()
})

describe('isHostRoutable', () => {
  it('is a NO-OP while the flag is off — the pre-backfill production posture', () => {
    delete process.env.DOMAIN_VERIFICATION_ENFORCE_ROUTING
    getDomainVerification.mockResolvedValue(null)
    return expect(
      isHostRoutable('cloudnativedays.no', ['cloudnativedays.no'], NOW),
    ).resolves.toBe(true)
  })

  it('serves a verified host under enforcement', async () => {
    getDomainVerification.mockResolvedValue(record())
    expect(await isHostRoutable('example.com', ['example.com'], NOW)).toBe(true)
  })

  it('refuses a claimed but unverified host under enforcement', async () => {
    getDomainVerification.mockResolvedValue(record({ status: 'pending' }))
    expect(await isHostRoutable('example.com', ['example.com'], NOW)).toBe(
      false,
    )
  })

  it('fails CLOSED when the claim has no verification record at all', async () => {
    getDomainVerification.mockResolvedValue(null)
    expect(await isHostRoutable('example.com', ['example.com'], NOW)).toBe(
      false,
    )
  })

  it('checks the WILDCARD entry that actually matched the host', async () => {
    getDomainVerification.mockImplementation(async (hostname) =>
      hostname === '*.example.com'
        ? record({ hostname: '*.example.com' })
        : null,
    )
    expect(
      await isHostRoutable('sub.example.com', ['*.example.com'], NOW),
    ).toBe(true)
    expect(getDomainVerification).toHaveBeenCalledWith('*.example.com')
  })

  it('prefers the EXACT claim over the wildcard when both are held', async () => {
    getDomainVerification.mockImplementation(async (hostname) =>
      hostname === 'sub.example.com'
        ? record({ hostname: 'sub.example.com', status: 'pending' })
        : record({ hostname: '*.example.com' }),
    )
    expect(
      await isHostRoutable(
        'sub.example.com',
        ['sub.example.com', '*.example.com'],
        NOW,
      ),
    ).toBe(false)
  })

  it('refuses a host no claim in the list actually covers', async () => {
    getDomainVerification.mockResolvedValue(record())
    expect(await isHostRoutable('other.example', ['example.com'], NOW)).toBe(
      false,
    )
  })

  describe('platform-allocated subdomains', () => {
    /**
     * An allocation with NO proof of any kind (`pending`), so these assertions
     * can only pass through the allocation rule — a `verified` fixture would
     * route for the ordinary reason and prove nothing.
     */
    const allocation = (hostname: string) =>
      record({
        _id: `domainVerification.${hostname}`,
        hostname,
        status: 'pending' as const,
        method: 'platform-owned' as const,
        lastSuccessAt: null,
      })

    beforeEach(() => {
      vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
    })

    it('serves a platform subdomain the platform ALLOCATED', async () => {
      getDomainVerification.mockResolvedValue(allocation('kubeday.konf.run'))
      expect(
        await isHostRoutable('kubeday.konf.run', ['kubeday.konf.run'], NOW),
      ).toBe(true)
    })

    it('FAILS CLOSED for an in-zone host with NO record — no suffix exemption', async () => {
      // The hijack, at the routing gate: a hostname ending in our suffix must
      // not be served just because it ends in our suffix. Without an allocation
      // there is nothing to honour.
      getDomainVerification.mockResolvedValue(null)
      expect(
        await isHostRoutable(
          'some-other-tenant.konf.run',
          ['some-other-tenant.konf.run'],
          NOW,
        ),
      ).toBe(false)
      // It genuinely consulted the record rather than short-circuiting.
      expect(getDomainVerification).toHaveBeenCalledWith(
        'some-other-tenant.konf.run',
      )
    })

    it('FAILS CLOSED for an in-zone host whose record is merely pending', async () => {
      getDomainVerification.mockResolvedValue(
        record({ hostname: 'kubeday.konf.run', status: 'pending' }),
      )
      expect(
        await isHostRoutable('kubeday.konf.run', ['kubeday.konf.run'], NOW),
      ).toBe(false)
    })

    it('still requires the host to be CLAIMED by this conference', async () => {
      getDomainVerification.mockResolvedValue(
        allocation('someone-else.konf.run'),
      )
      expect(
        await isHostRoutable(
          'someone-else.konf.run',
          ['kubeday.konf.run'],
          NOW,
        ),
      ).toBe(false)
    })

    it('does NOT extend the allocation to a `*.konf.run` wildcard claim', async () => {
      getDomainVerification.mockResolvedValue(allocation('*.konf.run'))
      expect(
        await isHostRoutable('kubeday.konf.run', ['*.konf.run'], NOW),
      ).toBe(false)
      expect(getDomainVerification).toHaveBeenCalledWith('*.konf.run')
    })

    it('REFUSES a label-boundary near-miss even with an allocation record', async () => {
      getDomainVerification.mockImplementation(async (hostname) =>
        allocation(hostname),
      )
      expect(
        await isHostRoutable('evil-konf.run', ['evil-konf.run'], NOW),
      ).toBe(false)
      expect(
        await isHostRoutable(
          'konf.run.attacker.com',
          ['konf.run.attacker.com'],
          NOW,
        ),
      ).toBe(false)
    })

    it('leaves CUSTOM domains fail-closed on a missing record', async () => {
      getDomainVerification.mockResolvedValue(null)
      expect(
        await isHostRoutable('cloudnativedays.no', ['cloudnativedays.no'], NOW),
      ).toBe(false)
    })

    it('REFUSES a revoked allocation', async () => {
      getDomainVerification.mockResolvedValue({
        ...allocation('kubeday.konf.run'),
        status: 'revoked' as const,
      })
      expect(
        await isHostRoutable('kubeday.konf.run', ['kubeday.konf.run'], NOW),
      ).toBe(false)
    })

    it('FAILS CLOSED for the same allocated host when the suffix is unset', async () => {
      vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
      getDomainVerification.mockResolvedValue(allocation('kubeday.konf.run'))
      expect(
        await isHostRoutable('kubeday.konf.run', ['kubeday.konf.run'], NOW),
      ).toBe(false)
    })
  })
})
