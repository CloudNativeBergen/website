import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { mockResolveTier, mockConsume } = vi.hoisted(() => ({
  mockResolveTier: vi.fn(),
  mockConsume: vi.fn(),
}))

vi.mock('@/lib/auth/email-link/tier', () => ({
  resolveEmailLinkTier: mockResolveTier,
}))
vi.mock('@/lib/auth/email-link/store', () => ({
  consumeStoredToken: mockConsume,
}))

import { verifyEmailSignInToken } from '@/lib/auth/email-link/verify'
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
})
