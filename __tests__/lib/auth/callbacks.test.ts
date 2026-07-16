/**
 * @vitest-environment node
 *
 * Tests for the extracted NextAuth `session` and `redirect` callbacks
 * (src/lib/auth.ts). These bodies used to live inline in `config.callbacks`,
 * which is passed to the globally-mocked `next-auth`, so the real logic never
 * ran in tests. They are now exported named functions referenced from the
 * config, making the security-critical behaviour directly testable:
 *   - `redirectCallback`: the OPEN-REDIRECT guard (same-origin check on the
 *     parsed URL) and the Phase-2 `linkResult` param append (same-origin only).
 *   - `sessionCallback`: the exact client-visible session shape (trimmed user +
 *     speaker/account lifted off the JWT).
 *
 * `@/lib/auth-link` is the real module here (not mocked); `redirectCallback`
 * dynamically imports it and reads `linkResultStore`, so the link-result cases
 * run the callback inside `linkResultStore.run(...)`.
 */
import { describe, it, expect } from 'vitest'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { redirectCallback, sessionCallback } from '@/lib/auth'
import { linkResultStore, LINK_RESULT_PARAM } from '@/lib/auth-link'

const BASE = 'https://2026.cloudnativedays.no'

describe('redirectCallback — open-redirect guard', () => {
  it('allows a same-origin absolute URL under baseUrl', async () => {
    const target = await redirectCallback({
      url: `${BASE}/cfp/list`,
      baseUrl: BASE,
    })
    expect(target).toBe(`${BASE}/cfp/list`)
  })

  it('allows a relative URL by resolving it onto baseUrl', async () => {
    const target = await redirectCallback({
      url: '/cfp/list',
      baseUrl: BASE,
    })
    expect(target).toBe(`${BASE}/cfp/list`)
  })

  it('rejects an off-site absolute URL, falling back to baseUrl', async () => {
    const target = await redirectCallback({
      url: 'https://evil.example.com/steal',
      baseUrl: BASE,
    })
    expect(target).toBe(BASE)
  })

  it('rejects a protocol-relative URL (//evil.com)', async () => {
    const target = await redirectCallback({
      url: '//evil.example.com/steal',
      baseUrl: BASE,
    })
    // Resolves to a different origin (https://evil.example.com) → must fall
    // back, never leak to the other host.
    expect(target).toBe(BASE)
  })

  it('rejects a look-alike host that only prefixes the base host', async () => {
    // `https://2026.cloudnativedays.no.evil.com` IS a string prefix of the base
    // URL — exactly what the old `startsWith(baseUrl)` guard leaked — but its
    // parsed origin differs, so the origin check rejects it.
    const target = await redirectCallback({
      url: 'https://2026.cloudnativedays.no.evil.com/x',
      baseUrl: BASE,
    })
    expect(target).toBe(BASE)
  })
})

describe('redirectCallback — Phase-2 link-result append', () => {
  it('appends the linkResult param on a same-origin redirect', async () => {
    const target = await linkResultStore.run({ result: 'linked' }, () =>
      redirectCallback({ url: `${BASE}/profile`, baseUrl: BASE }),
    )
    const url = new URL(target)
    expect(url.origin).toBe(BASE)
    expect(url.pathname).toBe('/profile')
    expect(url.searchParams.get(LINK_RESULT_PARAM)).toBe('linked')
  })

  it('does NOT append when there is no link result in the store', async () => {
    const target = await linkResultStore.run({}, () =>
      redirectCallback({ url: `${BASE}/profile`, baseUrl: BASE }),
    )
    expect(target).toBe(`${BASE}/profile`)
  })

  it('appends onto the safe baseUrl fallback after an off-site attempt', async () => {
    // Even when the requested URL is rejected, the (safe) baseUrl still carries
    // the outcome so the profile banner shows — but only ever on baseUrl.
    const target = await linkResultStore.run({ result: 'already-linked' }, () =>
      redirectCallback({ url: 'https://evil.example.com', baseUrl: BASE }),
    )
    const url = new URL(target)
    expect(url.origin).toBe(BASE)
    expect(url.searchParams.get(LINK_RESULT_PARAM)).toBe('already-linked')
  })
})

describe('sessionCallback — client-visible shape', () => {
  const baseSession = {
    expires: '2099-01-01T00:00:00.000Z',
    user: { name: 'stale', email: 'stale@old', image: 'old.jpg' },
  } as unknown as Session

  const token = {
    sub: 'sub-123',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    picture: 'https://cdn/ada.jpg',
    speaker: { _id: 'spk-1', isOrganizer: true },
    account: { provider: 'github', providerAccountId: '42', type: 'oauth' },
  } as unknown as JWT

  it('lifts speaker + account off the token and trims the user', async () => {
    const result = await sessionCallback({ session: baseSession, token })
    expect(result.speaker).toEqual({ _id: 'spk-1', isOrganizer: true })
    expect(result.account).toEqual({
      provider: 'github',
      providerAccountId: '42',
      type: 'oauth',
    })
    expect(result.user).toEqual({
      sub: 'sub-123',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      picture: 'https://cdn/ada.jpg',
    })
  })

  it('preserves non-user session fields (expires) via spread', async () => {
    const result = await sessionCallback({ session: baseSession, token })
    expect(result.expires).toBe('2099-01-01T00:00:00.000Z')
  })

  it('carries through an undefined speaker/account without throwing', async () => {
    const bare = { sub: 'sub-9', name: 'X', email: 'x@y', picture: '' } as JWT
    const result = await sessionCallback({ session: baseSession, token: bare })
    expect(result.speaker).toBeUndefined()
    expect(result.account).toBeUndefined()
    expect(result.user.sub).toBe('sub-9')
  })
})
