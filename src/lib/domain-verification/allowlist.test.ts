import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DomainVerificationRecord } from './types'

const listAllowlistCandidates =
  vi.fn<() => Promise<DomainVerificationRecord[]>>()

vi.mock('./sanity', () => ({
  listAllowlistCandidates: () => listAllowlistCandidates(),
}))

const { isVerifiedRedirectOrigin } = await import('./allowlist')

const NOW = new Date('2026-07-01T12:00:00.000Z')

function record(
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  return {
    _id: 'domainVerification.x',
    hostname: 'konf.app',
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
  listAllowlistCandidates.mockReset()
})

describe('isVerifiedRedirectOrigin', () => {
  it('accepts an ownership-verified exact host', async () => {
    listAllowlistCandidates.mockResolvedValue([record()])
    expect(await isVerifiedRedirectOrigin('https://konf.app', NOW)).toBe(true)
  })

  it('refuses a host that is CLAIMED but not verified', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record({ status: 'pending', lastSuccessAt: null }),
    ])
    expect(await isVerifiedRedirectOrigin('https://konf.app', NOW)).toBe(false)
  })

  it('refuses a host whose proof has stopped resolving (dangling DNS)', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record({
        status: 'failing',
        firstFailureAt: '2026-06-30T00:00:00.000Z',
        consecutiveFailures: 1,
      }),
    ])
    expect(await isVerifiedRedirectOrigin('https://konf.app', NOW)).toBe(false)
  })

  it('refuses a WILDCARD-adjacent host — the routing matcher is NOT reused', async () => {
    // `*.example.com` is verified and routing WOULD serve `sub.example.com`
    // through it. The allowlist must not: that is exactly the prefix/wildcard
    // redirect matching RFC 9700 §4.1.3 warns about.
    listAllowlistCandidates.mockResolvedValue([
      record({ hostname: '*.example.com' }),
    ])
    expect(await isVerifiedRedirectOrigin('https://sub.example.com', NOW)).toBe(
      false,
    )
    expect(await isVerifiedRedirectOrigin('https://example.com', NOW)).toBe(
      false,
    )
  })

  it('refuses look-alike hosts that share a prefix or suffix', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record({ hostname: 'example.com' }),
    ])
    for (const origin of [
      'https://example.com.evil.net',
      'https://evil-example.com',
      'https://sub.example.com',
      'https://example.como',
    ]) {
      expect(await isVerifiedRedirectOrigin(origin, NOW), origin).toBe(false)
    }
    expect(await isVerifiedRedirectOrigin('https://example.com', NOW)).toBe(
      true,
    )
  })

  it('treats a port as part of the host', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record({ hostname: 'example.com' }),
    ])
    expect(
      await isVerifiedRedirectOrigin('https://example.com:8443', NOW),
    ).toBe(false)
  })

  it('refuses non-https origins and unparseable input', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record({ hostname: 'example.com' }),
    ])
    expect(await isVerifiedRedirectOrigin('http://example.com', NOW)).toBe(
      false,
    )
    expect(await isVerifiedRedirectOrigin('//example.com', NOW)).toBe(false)
    expect(await isVerifiedRedirectOrigin('example.com', NOW)).toBe(false)
    expect(await isVerifiedRedirectOrigin('', NOW)).toBe(false)
  })

  it('is case-insensitive about the host', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record({ hostname: 'example.com' }),
    ])
    expect(await isVerifiedRedirectOrigin('https://EXAMPLE.com', NOW)).toBe(
      true,
    )
  })

  it('fails closed when nothing is verified at all', async () => {
    listAllowlistCandidates.mockResolvedValue([])
    expect(await isVerifiedRedirectOrigin('https://example.com', NOW)).toBe(
      false,
    )
  })
})
