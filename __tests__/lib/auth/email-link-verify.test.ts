import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { mockResolveTier, mockConsume, mockFind, mockIsServedTenantHost } =
  vi.hoisted(() => ({
    mockResolveTier: vi.fn(),
    mockConsume: vi.fn(),
    mockFind: vi.fn(),
    mockIsServedTenantHost: vi.fn(),
  }))

vi.mock('@/lib/auth/email-link/tier', () => ({
  resolveEmailLinkTier: mockResolveTier,
}))
vi.mock('@/lib/auth/email-link/store', () => ({
  consumeStoredToken: mockConsume,
  findStoredToken: mockFind,
}))
vi.mock('@/lib/auth/email-link/audience', () => ({
  isServedTenantHost: mockIsServedTenantHost,
}))

import {
  peekEmailSignInToken,
  verifyEmailSignInToken,
} from '@/lib/auth/email-link/verify'
import {
  mintStatelessToken,
  mintStoredToken,
} from '@/lib/auth/email-link/token'

const HOST = 'tenant-a.example.com'
const OTHER = 'tenant-b.example.com'
const NOW = 1_700_000_000_000

describe('email sign-in link verification', () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
    mockResolveTier.mockResolvedValue('stateless')
    // Both tenant hosts are served by the platform; `evil.example.net` is not.
    mockIsServedTenantHost.mockImplementation(
      async (host: string) => host === HOST || host === OTHER,
    )
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  })

  it('accepts a valid stateless token for a non-privileged identity', async () => {
    const token = mintStatelessToken('speaker@example.com', HOST, 300, NOW)
    expect(await verifyEmailSignInToken(token, HOST, NOW + 1_000)).toEqual({
      ok: true,
      identifier: 'speaker@example.com',
      tier: 'stateless',
    })
  })

  it('REFUSES a stateless token for an identity that is now stored-tier', async () => {
    // The organizer promotion (or a stale tier read at mint time) must not let
    // a privileged account in on a replayable token.
    mockResolveTier.mockResolvedValue('stored')
    const token = mintStatelessToken('organizer@example.com', HOST, 300, NOW)
    expect(await verifyEmailSignInToken(token, HOST, NOW + 1_000)).toEqual({
      ok: false,
      reason: 'tier-mismatch',
    })
  })

  it('REFUSES an expired stateless token', async () => {
    const token = mintStatelessToken('speaker@example.com', HOST, 300, NOW)
    expect(await verifyEmailSignInToken(token, HOST, NOW + 301_000)).toEqual({
      ok: false,
      reason: 'expired',
    })
    // Never even reaches the identity lookup.
    expect(mockResolveTier).not.toHaveBeenCalled()
  })

  it("REFUSES a stateless token redeemed on ANOTHER TENANT'S host", async () => {
    const token = mintStatelessToken('speaker@example.com', HOST, 300, NOW)
    expect(await verifyEmailSignInToken(token, OTHER, NOW + 1_000)).toEqual({
      ok: false,
      reason: 'audience',
    })
  })

  it('accepts a stored token and reports the stored tier', async () => {
    const token = mintStoredToken()
    mockConsume.mockResolvedValue({
      ok: true,
      identifier: 'organizer@example.com',
      origin: HOST,
    })
    expect(await verifyEmailSignInToken(token, HOST, NOW)).toEqual({
      ok: true,
      identifier: 'organizer@example.com',
      tier: 'stored',
    })
  })

  it("REFUSES a stored token redeemed on ANOTHER TENANT'S host, after burning it", async () => {
    const token = mintStoredToken()
    mockConsume.mockResolvedValue({
      ok: true,
      identifier: 'organizer@example.com',
      origin: HOST,
    })
    expect(await verifyEmailSignInToken(token, OTHER, NOW)).toEqual({
      ok: false,
      reason: 'audience',
    })
    // The single-use consume ran first, so the token cannot be retried on the
    // correct host either — a cross-origin attempt destroys the link.
    expect(mockConsume).toHaveBeenCalledTimes(1)
  })

  it('propagates a lost single-use race as a refusal', async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: 'race' })
    expect(await verifyEmailSignInToken(mintStoredToken(), HOST, NOW)).toEqual({
      ok: false,
      reason: 'race',
    })
  })

  it('refuses anything without a token or without a host', async () => {
    const token = mintStatelessToken('speaker@example.com', HOST, 300, NOW)
    expect(await verifyEmailSignInToken(null, HOST, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(await verifyEmailSignInToken(token, null, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(await verifyEmailSignInToken('no-known-prefix', HOST, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  // ── F2: the audience allowlist at REDEMPTION ─────────────────────────────
  // The review's probe: mint a token for `evil.example.net`, replay it with
  // `x-forwarded-host: evil.example.net`, and the audience check passes because
  // it compares an attacker-supplied value against an attacker-supplied value.
  // It now fails at step 0 — before the token is even parsed.
  describe('spoofed-host replay (F2 reproduction)', () => {
    const EVIL = 'evil.example.net'

    it('REFUSES a token whose audience is a host the platform does not serve', async () => {
      const token = mintStatelessToken('victim@example.com', EVIL, 300, NOW)
      expect(await verifyEmailSignInToken(token, EVIL, NOW + 1_000)).toEqual({
        ok: false,
        reason: 'audience',
      })
      // The identity lookup never runs — the request stops at the host check.
      expect(mockResolveTier).not.toHaveBeenCalled()
    })

    it('does NOT burn a stored token when the host is not served', async () => {
      mockConsume.mockResolvedValue({
        ok: true,
        identifier: 'organizer@example.com',
        origin: EVIL,
      })
      expect(
        await verifyEmailSignInToken(mintStoredToken(), EVIL, NOW),
      ).toEqual({ ok: false, reason: 'audience' })
      // Otherwise a spoofed header would be a denial-of-service against a
      // legitimate user's single-use link.
      expect(mockConsume).not.toHaveBeenCalled()
    })

    it('fails CLOSED when the served-host lookup is unavailable', async () => {
      mockIsServedTenantHost.mockResolvedValue(false)
      const token = mintStatelessToken('speaker@example.com', HOST, 300, NOW)
      expect(await verifyEmailSignInToken(token, HOST, NOW + 1_000)).toEqual({
        ok: false,
        reason: 'audience',
      })
    })
  })
})

describe('peeking a token for the confirmation interstitial', () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
    mockIsServedTenantHost.mockImplementation(
      async (host: string) => host === HOST || host === OTHER,
    )
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  })

  it('names the identity WITHOUT consuming a single-use token', async () => {
    mockFind.mockResolvedValue({
      identifier: 'organizer@example.com',
      origin: HOST,
      expiresAt: new Date(NOW + 60_000).toISOString(),
    })
    expect(await peekEmailSignInToken(mintStoredToken(), HOST, NOW)).toEqual({
      ok: true,
      identifier: 'organizer@example.com',
    })
    // Rendering the interstitial must never burn the link it is asking about.
    expect(mockConsume).not.toHaveBeenCalled()
  })

  it('applies the same host, signature and expiry rules as redemption', async () => {
    const token = mintStatelessToken('speaker@example.com', HOST, 300, NOW)
    expect(await peekEmailSignInToken(token, HOST, NOW + 1_000)).toEqual({
      ok: true,
      identifier: 'speaker@example.com',
    })
    expect(await peekEmailSignInToken(token, OTHER, NOW + 1_000)).toEqual({
      ok: false,
    })
    expect(await peekEmailSignInToken(token, HOST, NOW + 301_000)).toEqual({
      ok: false,
    })
    expect(
      await peekEmailSignInToken(`${token}tampered`, HOST, NOW + 1_000),
    ).toEqual({ ok: false })
    expect(
      await peekEmailSignInToken(
        mintStatelessToken('victim@example.com', 'evil.example.net', 300, NOW),
        'evil.example.net',
        NOW + 1_000,
      ),
    ).toEqual({ ok: false })
  })
})
