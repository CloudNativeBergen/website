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
})
