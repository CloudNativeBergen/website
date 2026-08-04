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

  describe('platform-owned subdomains', () => {
    beforeEach(() => {
      vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
    })

    it('serves a platform subdomain with NO verification record at all', async () => {
      // Enforcement must not take a platform-hosted tenant offline over a
      // missing sidecar document for a zone only we can write to.
      getDomainVerification.mockResolvedValue(null)
      expect(
        await isHostRoutable('kubeday.konf.run', ['kubeday.konf.run'], NOW),
      ).toBe(true)
      // …and it did not even need to look one up.
      expect(getDomainVerification).not.toHaveBeenCalled()
    })

    it('still requires the host to be CLAIMED by this conference', async () => {
      getDomainVerification.mockResolvedValue(null)
      expect(
        await isHostRoutable(
          'someone-else.konf.run',
          ['kubeday.konf.run'],
          NOW,
        ),
      ).toBe(false)
    })

    it('does NOT extend the exemption to a `*.konf.run` wildcard claim', async () => {
      getDomainVerification.mockResolvedValue(null)
      expect(
        await isHostRoutable('kubeday.konf.run', ['*.konf.run'], NOW),
      ).toBe(false)
      expect(getDomainVerification).toHaveBeenCalledWith('*.konf.run')
    })

    it('REFUSES a label-boundary near-miss with no record', async () => {
      getDomainVerification.mockResolvedValue(null)
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

    it('FAILS CLOSED for the same platform host when the suffix is unset', async () => {
      vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
      getDomainVerification.mockResolvedValue(null)
      expect(
        await isHostRoutable('kubeday.konf.run', ['kubeday.konf.run'], NOW),
      ).toBe(false)
    })
  })
})
