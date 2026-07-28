/**
 * @vitest-environment node
 *
 * PER-REQUEST SESSION-COOKIE DOMAIN — the multi-tenant regression net (#682).
 *
 * The defect this pins: the cookie `Domain` used to be computed ONCE at module
 * load from `NEXT_PUBLIC_BASE_URL` and baked into the static NextAuth config, so
 * it was applied to EVERY request host. A tenant on their own apex therefore
 * received a `Set-Cookie` whose `Domain` the browser REJECTS — OAuth succeeded,
 * the cookie was dropped, and the user bounced back to sign-in with NO error.
 *
 * These tests run TWO different hosts through ONE process. That is precisely
 * what a module-load-time constant cannot satisfy: with the old code every
 * assertion below that compares two hosts fails by construction.
 *
 * They drive the app's REAL exported `handlers` (the wrapper in `src/lib/auth.ts`
 * around what `NextAuth(config)` returns), not a re-implementation.
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { handlers } from '@/lib/auth'
import {
  applySessionCookieDomain,
  rewriteSessionCookieDomains,
  sessionCookieRequestHost,
  SESSION_TOKEN_COOKIE_NAMES,
} from '@/lib/auth-cookie-domain'

const [SECURE_COOKIE, BARE_COOKIE] = SESSION_TOKEN_COOKIE_NAMES

/** A realistic @auth/core session Set-Cookie (host-only, as the config emits). */
const setCookie = (name: string = SECURE_COOKIE, value = 'jwt.token.value') =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`

/** A realistic @auth/core `sessionStore.clean()` clear. */
const clearCookie = (name = SECURE_COOKIE) =>
  `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`

/** Drive the REAL `/api/auth/*` GET handler for a given request host. */
async function getForHost(host: string, cookies: string[]): Promise<string[]> {
  const req = new NextRequest('https://ignored.example/api/auth/session', {
    headers: {
      'x-forwarded-host': host,
      'x-mock-set-cookie': JSON.stringify(cookies),
    },
  })
  const res = await handlers.GET(req)
  return res.headers.getSetCookie()
}

/** The `Domain=` attribute of a Set-Cookie, or undefined when host-only. */
function domainOf(setCookieValue: string): string | undefined {
  for (const attr of setCookieValue.split(';').slice(1)) {
    const eq = attr.indexOf('=')
    if (eq === -1) continue
    if (attr.slice(0, eq).trim().toLowerCase() === 'domain') {
      return attr.slice(eq + 1).trim()
    }
  }
  return undefined
}

describe('session cookie Domain is derived PER REQUEST (#682)', () => {
  it('gives TWO different hosts TWO different Domains in one process', async () => {
    // THE core regression: a module-load constant physically cannot do this.
    const [platform] = await getForHost('admin.cloudnativedays.no', [
      setCookie(),
    ])
    const [tenant] = await getForHost('www.someconf.com', [setCookie()])

    expect(domainOf(platform)).toBe('.cloudnativedays.no')
    expect(domainOf(tenant)).toBe('.someconf.com')
    expect(domainOf(platform)).not.toBe(domainOf(tenant))
  })

  it('gives a tenant apex a Domain the browser ACCEPTS, never the platform’s', async () => {
    const [cookie] = await getForHost('someconf.com', [setCookie()])
    const domain = domainOf(cookie)

    // `.someconf.com` domain-matches the request host `someconf.com`, so the
    // browser stores it. The platform's own domain would be REJECTED outright.
    expect(domain).toBe('.someconf.com')
    expect(domain).not.toBe('.cloudnativedays.no')
    expect(domain).not.toBe('.konf.app')
    expect(`someconf.com`.endsWith(domain!.slice(1))).toBe(true)
  })

  it('keeps platform-shared parents host-only (konf.run AND konf.app)', async () => {
    for (const host of [
      'tenant-a.konf.run',
      'konf.run',
      'app.konf.app',
      'konf.app',
    ]) {
      const [cookie] = await getForHost(host, [setCookie()])
      expect(domainOf(cookie), `host ${host}`).toBeUndefined()
    }
  })

  it('never carries a stale Domain over from a previous request', async () => {
    // Order matters: a widened host first, then a denylisted one. A cached or
    // module-level value would leak `.cloudnativedays.no` onto the konf.app host.
    await getForHost('admin.cloudnativedays.no', [setCookie()])
    const [konf] = await getForHost('tenant.konf.app', [setCookie()])
    expect(domainOf(konf)).toBeUndefined()

    const [back] = await getForHost('cloudnativedays.no', [setCookie()])
    expect(domainOf(back)).toBe('.cloudnativedays.no')
  })

  it('replaces a Domain already present rather than appending a second one', async () => {
    const [cookie] = await getForHost('www.someconf.com', [
      `${setCookie()}; Domain=.wrong-platform.example`,
    ])
    expect(cookie.match(/domain=/gi)?.length).toBe(1)
    expect(domainOf(cookie)).toBe('.someconf.com')
  })

  it('rewrites chunked session cookies too', async () => {
    const cookies = await getForHost('admin.someconf.com', [
      setCookie(`${SECURE_COOKIE}.0`, 'part0'),
      setCookie(`${SECURE_COOKIE}.1`, 'part1'),
    ])
    expect(cookies).toHaveLength(2)
    for (const cookie of cookies) expect(domainOf(cookie)).toBe('.someconf.com')
  })

  it('leaves NON-session auth cookies host-only', async () => {
    const cookies = await getForHost('admin.someconf.com', [
      '__Host-authjs.csrf-token=abc; Path=/; HttpOnly; Secure; SameSite=Lax',
      '__Secure-authjs.callback-url=https%3A%2F%2Fx; Path=/; HttpOnly; Secure',
      setCookie(),
    ])
    expect(domainOf(cookies[0])).toBeUndefined()
    expect(domainOf(cookies[1])).toBeUndefined()
    expect(domainOf(cookies[2])).toBe('.someconf.com')
  })
})

describe('sign-out clears at the same Domain it set (#682)', () => {
  it('clears BOTH the Domain-scoped cookie and the host-only one', async () => {
    const host = 'admin.someconf.com'
    const [set] = await getForHost(host, [setCookie()])
    const cleared = await getForHost(host, [clearCookie()])

    // The Domain the cookie was SET with must be among the clears, or the
    // browser keeps a cookie the app believes it deleted.
    expect(cleared.map(domainOf)).toContain(domainOf(set))
    // …and a residual HOST-ONLY cookie of the same name (set before this
    // feature, or while the host sat on the denylist) must be cleared too — a
    // Set-Cookie carrying a Domain can never remove a host-only cookie.
    expect(cleared.map(domainOf)).toContain(undefined)
    for (const cookie of cleared) {
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970')
    }
  })

  it('emits a single host-only clear when the host is denylisted', async () => {
    const cleared = await getForHost('tenant.konf.app', [clearCookie()])
    expect(cleared).toHaveLength(1)
    expect(domainOf(cleared[0])).toBeUndefined()
  })

  it('treats Max-Age=0 as a clear as well', () => {
    const cleared = rewriteSessionCookieDomains(
      [`${BARE_COOKIE}=; Path=/; Max-Age=0; HttpOnly`],
      'admin.someconf.com',
    )
    expect(cleared).toHaveLength(2)
    expect(cleared.map(domainOf)).toEqual([undefined, '.someconf.com'])
  })
})

describe('applySessionCookieDomain — response plumbing', () => {
  it('returns the response untouched when nothing needs rewriting', () => {
    const res = new Response(null, { status: 204 })
    expect(applySessionCookieDomain(res, 'someconf.com')).toBe(res)
  })

  it('preserves status, other headers and the body', async () => {
    const res = new Response('hello', {
      status: 302,
      headers: {
        location: '/cfp/list',
        'set-cookie': setCookie(),
      },
    })
    const out = applySessionCookieDomain(res, 'admin.someconf.com')
    expect(out.status).toBe(302)
    expect(out.headers.get('location')).toBe('/cfp/list')
    expect(domainOf(out.headers.getSetCookie()[0])).toBe('.someconf.com')
    expect(await out.text()).toBe('hello')
  })

  it('is a no-op for a missing/nonstandard response', () => {
    expect(
      applySessionCookieDomain(undefined as unknown as Response, 'x.com'),
    ).toBeUndefined()
  })
})

describe('sessionCookieRequestHost', () => {
  it('prefers x-forwarded-host, falls back to host', () => {
    expect(
      sessionCookieRequestHost(
        new Headers({ 'x-forwarded-host': 'a.com', host: 'b.com' }),
      ),
    ).toBe('a.com')
    expect(sessionCookieRequestHost(new Headers({ host: 'b.com' }))).toBe(
      'b.com',
    )
    expect(sessionCookieRequestHost(new Headers())).toBeNull()
  })
})
