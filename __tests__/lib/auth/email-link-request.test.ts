import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { mockRateLimit, mockResolveTier, mockCreateStoredToken } = vi.hoisted(
  () => ({
    mockRateLimit: vi.fn(),
    mockResolveTier: vi.fn(),
    mockCreateStoredToken: vi.fn(),
  }),
)

vi.mock('@/lib/auth/email-link/rateLimit', () => ({
  checkEmailLinkRateLimit: mockRateLimit,
  clientIpFromHeaders: (h: Headers) =>
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
}))
vi.mock('@/lib/auth/email-link/tier', () => ({
  resolveEmailLinkTier: mockResolveTier,
}))
vi.mock('@/lib/auth/email-link/store', () => ({
  createStoredToken: mockCreateStoredToken,
}))

import {
  isPlausibleEmail,
  requestEmailSignInLink,
  type RequestEmailSignInLinkDeps,
} from '@/lib/auth/email-link/request'
import { verifyStatelessToken } from '@/lib/auth/email-link/token'

type SendMock = ReturnType<typeof vi.fn<RequestEmailSignInLinkDeps['send']>>

const NOW = 1_700_000_000_000
const HOST = 'tenant-a.example.com'

function headers(extra: Record<string, string> = {}) {
  return new Headers({ host: HOST, ...extra })
}

describe('requesting an email sign-in link', () => {
  let previousSecret: string | undefined
  let send: SendMock

  beforeEach(() => {
    previousSecret = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
    mockRateLimit.mockResolvedValue({ allowed: true })
    mockResolveTier.mockResolvedValue('stateless')
    mockCreateStoredToken.mockResolvedValue({ ok: true })
    send = vi.fn().mockResolvedValue(true)
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  })

  it('mints a link on the REQUEST host and binds the token to it', async () => {
    await requestEmailSignInLink(
      { email: 'Speaker@Example.com', headers: headers(), now: NOW },
      { send },
    )

    const { signInUrl } = send.mock.calls[0][0]
    const url = new URL(signInUrl)
    expect(url.origin).toBe(`https://${HOST}`)
    expect(url.pathname).toBe('/api/auth/email-link/callback')

    const token = url.searchParams.get('token')!
    // The token verifies on the minting host and NOWHERE else.
    expect(verifyStatelessToken(token, HOST, NOW + 1_000)).toEqual({
      ok: true,
      identifier: 'speaker@example.com',
      audience: HOST,
    })
    expect(verifyStatelessToken(token, 'other.example.com', NOW + 1_000).ok).toBe(
      false,
    )
  })

  it('follows x-forwarded-host, so the link matches the tenant the user is on', async () => {
    await requestEmailSignInLink(
      {
        email: 'speaker@example.com',
        headers: headers({ 'x-forwarded-host': 'tenant-b.example.com' }),
        now: NOW,
      },
      { send },
    )
    expect(new URL(send.mock.calls[0][0].signInUrl).host).toBe(
      'tenant-b.example.com',
    )
  })

  it('delivers to the CANONICAL address but tokenizes the NORMALIZED one', async () => {
    await requestEmailSignInLink(
      { email: '  Speaker@Example.com ', headers: headers(), now: NOW },
      { send },
    )
    expect(send.mock.calls[0][0].to).toBe('speaker@example.com')
  })

  it('returns the SAME result for an unknown address as for a known one', async () => {
    const unknown = await requestEmailSignInLink(
      { email: 'nobody@example.com', headers: headers(), now: NOW },
      { send },
    )
    mockResolveTier.mockResolvedValue('stored')
    const known = await requestEmailSignInLink(
      { email: 'organizer@example.com', headers: headers(), now: NOW },
      { send },
    )
    expect(unknown).toEqual(known)
    expect(unknown).toEqual({ uniform: true })
  })

  it('returns the SAME result when RATE LIMITED, and sends nothing', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, scope: 'email' })
    const limited = await requestEmailSignInLink(
      { email: 'speaker@example.com', headers: headers(), now: NOW },
      { send },
    )
    expect(limited).toEqual({ uniform: true })
    expect(send).not.toHaveBeenCalled()
  })

  it('returns the SAME result for a malformed address, and sends nothing', async () => {
    for (const bad of ['', 'not-an-email', 'a@b', 'a@@b.com', 'a b@c.com']) {
      const result = await requestEmailSignInLink(
        { email: bad, headers: headers(), now: NOW },
        { send },
      )
      expect(result).toEqual({ uniform: true })
    }
    expect(send).not.toHaveBeenCalled()
  })

  it('uses the STORED tier for an organizer and says so in the mail copy', async () => {
    mockResolveTier.mockResolvedValue('stored')
    await requestEmailSignInLink(
      { email: 'organizer@example.com', headers: headers(), now: NOW },
      { send },
    )

    expect(mockCreateStoredToken).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'organizer@example.com',
        origin: HOST,
      }),
    )
    const args = send.mock.calls[0][0]
    expect(args.singleUse).toBe(true)
    expect(args.expiresInMinutes).toBe(15)
    expect(new URL(args.signInUrl).searchParams.get('token')).toMatch(/^sd1\./)
  })

  it('uses the STATELESS tier for a speaker, with a 5-minute lifetime', async () => {
    await requestEmailSignInLink(
      { email: 'speaker@example.com', headers: headers(), now: NOW },
      { send },
    )
    expect(mockCreateStoredToken).not.toHaveBeenCalled()
    const args = send.mock.calls[0][0]
    expect(args.singleUse).toBe(false)
    expect(args.expiresInMinutes).toBe(5)
    expect(new URL(args.signInUrl).searchParams.get('token')).toMatch(/^st1\./)
  })

  it('FAILS CLOSED when a stored token cannot be persisted (no broken link mailed)', async () => {
    mockResolveTier.mockResolvedValue('stored')
    mockCreateStoredToken.mockResolvedValue({ ok: false })
    const result = await requestEmailSignInLink(
      { email: 'organizer@example.com', headers: headers(), now: NOW },
      { send },
    )
    expect(result).toEqual({ uniform: true })
    expect(send).not.toHaveBeenCalled()
  })

  it('carries only a same-site path as the post-sign-in destination', async () => {
    await requestEmailSignInLink(
      {
        email: 'speaker@example.com',
        headers: headers(),
        callbackUrl: 'https://evil.example/steal',
        now: NOW,
      },
      { send },
    )
    expect(
      new URL(send.mock.calls[0][0].signInUrl).searchParams.get('callbackUrl'),
    ).toBeNull()

    send.mockClear()
    await requestEmailSignInLink(
      {
        email: 'speaker2@example.com',
        headers: headers(),
        callbackUrl: '/cfp/list',
        now: NOW,
      },
      { send },
    )
    expect(
      new URL(send.mock.calls[0][0].signInUrl).searchParams.get('callbackUrl'),
    ).toBe('/cfp/list')
  })

  it('refuses to mint when the request has no usable host', async () => {
    await requestEmailSignInLink(
      { email: 'speaker@example.com', headers: new Headers({}), now: NOW },
      { send },
    )
    expect(send).not.toHaveBeenCalled()
  })
})

describe('isPlausibleEmail', () => {
  it('rejects values that could smuggle a recipient or a header', () => {
    for (const bad of [
      'a@b.com, c@d.com',
      'a@b.com;c@d.com',
      '"a"@b.com',
      'a@b.com\nBcc: c@d.com',
      '<a@b.com>',
      `${'x'.repeat(250)}@example.com`,
    ]) {
      expect(isPlausibleEmail(bad)).toBe(false)
    }
  })

  it('accepts ordinary addresses including sub-addressing', () => {
    for (const good of [
      'a@b.com',
      'jane.doe+cfp@sub.example.co.uk',
      "o'brien@example.org",
    ]) {
      expect(isPlausibleEmail(good)).toBe(true)
    }
  })
})
