import { describe, expect, it, beforeEach, vi } from 'vitest'

const { mockUncachedFetch } = vi.hoisted(() => ({ mockUncachedFetch: vi.fn() }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: mockUncachedFetch },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: { fetch: vi.fn() },
}))

import { isServedTenantHost } from '@/lib/auth/email-link/audience'

/**
 * The audience allowlist (F2). The host a magic link is minted for, and the host
 * it is redeemed on, both come from `x-forwarded-host`; without this check the
 * audience binding compares an attacker-supplied value to an attacker-supplied
 * value. So what matters here is the FAIL-CLOSED direction on every unusual
 * input, not just the happy path.
 */
describe('email-link audience allowlist', () => {
  beforeEach(() => vi.clearAllMocks())

  function claims(...domains: string[]) {
    mockUncachedFetch.mockResolvedValue(domains)
  }

  it('accepts a host a conference claims exactly', async () => {
    claims('2026.cloudnativebergen.dev', 'someconf.com')
    expect(await isServedTenantHost('someconf.com')).toBe(true)
    expect(await isServedTenantHost('2026.cloudnativebergen.dev')).toBe(true)
  })

  it('accepts a host covered by a single-label wildcard claim', async () => {
    claims('*.konf.app')
    expect(await isServedTenantHost('tenant.konf.app')).toBe(true)
    // The wildcard is single-label, exactly as the router resolves it.
    expect(await isServedTenantHost('a.b.konf.app')).toBe(false)
  })

  it('matches a dev claim that carries a port against the port-stripped host', async () => {
    // `requestHost()` strips the port; `domains[]` keeps it for dev entries.
    claims('localhost:3000')
    expect(await isServedTenantHost('localhost')).toBe(true)
  })

  it('REFUSES a host no conference claims', async () => {
    claims('someconf.com', '*.konf.app')
    for (const host of [
      'evil.example.net',
      'someconf.com.evil.net',
      'evil-someconf.com',
      'konf.app.evil.net',
    ]) {
      expect(await isServedTenantHost(host)).toBe(false)
    }
  })

  it('fails CLOSED on an empty, missing or unreadable claim set', async () => {
    claims()
    expect(await isServedTenantHost('someconf.com')).toBe(false)

    mockUncachedFetch.mockResolvedValue(null)
    expect(await isServedTenantHost('someconf.com')).toBe(false)

    mockUncachedFetch.mockRejectedValue(new Error('sanity down'))
    expect(await isServedTenantHost('someconf.com')).toBe(false)
  })

  it('fails CLOSED on an empty or absent host', async () => {
    claims('someconf.com')
    expect(await isServedTenantHost('')).toBe(false)
    expect(await isServedTenantHost(null)).toBe(false)
    expect(await isServedTenantHost(undefined)).toBe(false)
  })

  it('is never cached — a de-listing has to take effect immediately', async () => {
    claims('someconf.com')
    expect(await isServedTenantHost('someconf.com')).toBe(true)
    expect(mockUncachedFetch).toHaveBeenLastCalledWith(
      expect.any(String),
      {},
      { cache: 'no-store' },
    )
  })
})
