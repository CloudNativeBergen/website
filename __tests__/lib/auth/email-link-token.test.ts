import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  hashStoredToken,
  mintStatelessToken,
  mintStoredToken,
  rateLimitKey,
  tokenKind,
  verifyStatelessToken,
} from '@/lib/auth/email-link/token'
import {
  canonicalHost,
  requestHost,
  requestOrigin,
  safeCallbackPath,
} from '@/lib/auth/email-link/origin'

const SECRET = 'test-auth-secret-value'
const HOST = 'tenant-a.example.com'

describe('stateless email sign-in tokens', () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = SECRET
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  })

  it('round-trips a freshly minted token on its own host', () => {
    const token = mintStatelessToken('user@example.com', HOST, 300)
    expect(tokenKind(token)).toBe('stateless')

    const result = verifyStatelessToken(token, HOST)
    expect(result).toEqual({
      ok: true,
      identifier: 'user@example.com',
      audience: HOST,
    })
  })

  it('REJECTS an expired token', () => {
    const mintedAt = 1_000_000_000_000
    const token = mintStatelessToken('user@example.com', HOST, 300, mintedAt)

    // One second before expiry: still good.
    expect(verifyStatelessToken(token, HOST, mintedAt + 299_000).ok).toBe(true)
    // Exactly at expiry and beyond: refused.
    expect(verifyStatelessToken(token, HOST, mintedAt + 300_000)).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(verifyStatelessToken(token, HOST, mintedAt + 900_000)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it("REJECTS a token minted on ANOTHER TENANT'S origin", () => {
    const token = mintStatelessToken('user@example.com', HOST, 300)

    expect(verifyStatelessToken(token, 'tenant-b.example.com')).toEqual({
      ok: false,
      reason: 'audience',
    })
    // A registrable-domain relative must not help either.
    expect(verifyStatelessToken(token, 'example.com')).toEqual({
      ok: false,
      reason: 'audience',
    })
    // Nor a subdomain of the minting host.
    expect(verifyStatelessToken(token, `evil.${HOST}`)).toEqual({
      ok: false,
      reason: 'audience',
    })
  })

  it('REJECTS a token whose payload was tampered with', () => {
    const token = mintStatelessToken('user@example.com', HOST, 300)
    const [prefixAndBody, signature] = [
      token.slice(0, token.lastIndexOf('.')),
      token.slice(token.lastIndexOf('.') + 1),
    ]
    const body = prefixAndBody.slice('st1.'.length)

    // Re-encode the payload with a different identifier, keeping the signature.
    const decoded = JSON.parse(
      Buffer.from(
        body.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8'),
    )
    decoded.e = 'victim@example.com'
    const forgedBody = Buffer.from(JSON.stringify(decoded))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    expect(
      verifyStatelessToken(`st1.${forgedBody}.${signature}`, HOST),
    ).toEqual({ ok: false, reason: 'signature' })
  })

  it('REJECTS a token signed with a different secret', () => {
    const token = mintStatelessToken('user@example.com', HOST, 300)
    process.env.AUTH_SECRET = 'a-completely-different-secret'
    expect(verifyStatelessToken(token, HOST)).toEqual({
      ok: false,
      reason: 'signature',
    })
  })

  it('REJECTS malformed input without throwing', () => {
    for (const bad of ['', 'garbage', 'st1.', 'st1.abc', 'sd1.abc', '...']) {
      const result = verifyStatelessToken(bad, HOST)
      expect(result.ok).toBe(false)
    }
  })

  it('mints a distinct token per request for the same address and second', () => {
    const a = mintStatelessToken('user@example.com', HOST, 300, 1_000)
    const b = mintStatelessToken('user@example.com', HOST, 300, 1_000)
    expect(a).not.toBe(b)
  })

  it('never embeds the raw token in its stored hash', () => {
    const token = mintStoredToken()
    expect(tokenKind(token)).toBe('stored')
    const hash = hashStoredToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token.slice(4))
    // The hash is salted with AUTH_SECRET, so it changes with the secret.
    process.env.AUTH_SECRET = 'another-secret'
    expect(hashStoredToken(token)).not.toBe(hash)
  })

  it('derives rate-limit ids that leak neither the address nor the ip', () => {
    const key = rateLimitKey('email', 'user@example.com')
    expect(key).toMatch(/^emailSignInRate\.[0-9a-f]{64}$/)
    expect(key).not.toContain('user')
    expect(key).not.toContain('example.com')
    // Scope is part of the derivation: same subject, different bucket.
    expect(rateLimitKey('ip', 'user@example.com')).not.toBe(key)
  })
})

describe('origin derivation', () => {
  it('canonicalizes hosts to a bare, comparable hostname', () => {
    expect(canonicalHost('Tenant-A.Example.com')).toBe('tenant-a.example.com')
    expect(canonicalHost('tenant-a.example.com:3000')).toBe(
      'tenant-a.example.com',
    )
    expect(canonicalHost('a.example.com, proxy.internal')).toBe('a.example.com')
    expect(canonicalHost('[::1]')).toBeUndefined()
    expect(canonicalHost('')).toBeUndefined()
    expect(canonicalHost(null)).toBeUndefined()
  })

  it('prefers x-forwarded-host over host, matching the cookie scope rule', () => {
    const headers = new Headers({
      host: 'internal.vercel.app',
      'x-forwarded-host': 'tenant.example.com',
    })
    expect(requestHost(headers)).toBe('tenant.example.com')
  })

  it('builds the link origin from the request, defaulting to https', () => {
    expect(requestOrigin(new Headers({ host: 'tenant.example.com' }))).toBe(
      'https://tenant.example.com',
    )
    expect(
      requestOrigin(
        new Headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }),
      ),
    ).toBe('http://localhost:3000')
    expect(requestOrigin(new Headers({}))).toBeUndefined()
  })

  it('accepts only same-site absolute paths as a post-sign-in destination', () => {
    expect(safeCallbackPath('/cfp/list')).toBe('/cfp/list')
    expect(safeCallbackPath('/admin?tab=1')).toBe('/admin?tab=1')

    for (const hostile of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      'http://tenant.example.com/ok',
      'javascript:alert(1)',
      '/ok\nSet-Cookie: x=1',
      '',
      null,
      undefined,
    ]) {
      expect(safeCallbackPath(hostile)).toBe('/')
    }
  })
})
