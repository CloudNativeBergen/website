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
import { auth, handlers } from '@/lib/auth'
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
const clearCookie = (name: string = SECURE_COOKIE) =>
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

/** The cookie name of a Set-Cookie value. */
function setCookieNameOf(setCookieValue: string): string {
  return setCookieValue.split(';')[0].split('=')[0].trim()
}

/** True when a Set-Cookie DELETES the cookie rather than setting a value. */
function isClearing(setCookieValue: string): boolean {
  return /;\s*(expires=thu, 01 jan 1970|max-age=0)/i.test(setCookieValue)
}

/**
 * The cookie that actually carries the new session token. Every SET is now
 * accompanied by a counter-scope CLEAR (see `rewriteSessionCookieDomains`), so
 * tests must not blindly take the first Set-Cookie.
 */
function settingCookie(cookies: string[]): string {
  const setting = cookies.filter(
    (cookie) =>
      !isClearing(cookie) &&
      SESSION_TOKEN_COOKIE_NAMES.some((base) =>
        setCookieNameOf(cookie).startsWith(base),
      ),
  )
  expect(setting).toHaveLength(1)
  return setting[0]
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
    const platform = settingCookie(
      await getForHost('admin.cloudnativedays.no', [setCookie()]),
    )
    const tenant = settingCookie(
      await getForHost('www.someconf.com', [setCookie()]),
    )

    expect(domainOf(platform)).toBe('.cloudnativedays.no')
    expect(domainOf(tenant)).toBe('.someconf.com')
    expect(domainOf(platform)).not.toBe(domainOf(tenant))
  })

  it('gives a tenant apex a Domain the browser ACCEPTS, never the platform’s', async () => {
    const cookie = settingCookie(
      await getForHost('someconf.com', [setCookie()]),
    )
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
      const cookie = settingCookie(await getForHost(host, [setCookie()]))
      expect(domainOf(cookie), `host ${host}`).toBeUndefined()
    }
  })

  it('never carries a stale Domain over from a previous request', async () => {
    // Order matters: a widened host first, then a denylisted one. A cached or
    // module-level value would leak `.cloudnativedays.no` onto the konf.app host.
    await getForHost('admin.cloudnativedays.no', [setCookie()])
    const konf = settingCookie(
      await getForHost('tenant.konf.app', [setCookie()]),
    )
    expect(domainOf(konf)).toBeUndefined()

    const back = settingCookie(
      await getForHost('cloudnativedays.no', [setCookie()]),
    )
    expect(domainOf(back)).toBe('.cloudnativedays.no')
  })

  it('replaces a Domain already present rather than appending a second one', async () => {
    const cookie = settingCookie(
      await getForHost('www.someconf.com', [
        `${setCookie()}; Domain=.wrong-platform.example`,
      ]),
    )
    expect(cookie.match(/domain=/gi)?.length).toBe(1)
    expect(domainOf(cookie)).toBe('.someconf.com')
  })

  it('rewrites chunked session cookies too', async () => {
    const cookies = (
      await getForHost('admin.someconf.com', [
        setCookie(`${SECURE_COOKIE}.0`, 'part0'),
        setCookie(`${SECURE_COOKIE}.1`, 'part1'),
      ])
    ).filter((cookie) => !isClearing(cookie))
    expect(cookies).toHaveLength(2)
    for (const cookie of cookies) expect(domainOf(cookie)).toBe('.someconf.com')
  })

  it('leaves NON-session auth cookies host-only', async () => {
    const cookies = await getForHost('admin.someconf.com', [
      '__Host-authjs.csrf-token=abc; Path=/; HttpOnly; Secure; SameSite=Lax',
      '__Secure-authjs.callback-url=https%3A%2F%2Fx; Path=/; HttpOnly; Secure',
      setCookie(),
    ])
    // Untouched, in place, and never given a Domain — `__Host-` forbids one.
    expect(cookies[0]).toContain('__Host-authjs.csrf-token=abc')
    expect(domainOf(cookies[0])).toBeUndefined()
    expect(cookies[1]).toContain('__Secure-authjs.callback-url=')
    expect(domainOf(cookies[1])).toBeUndefined()
    expect(domainOf(settingCookie(cookies))).toBe('.someconf.com')
  })
})

describe('sign-out clears at the same Domain it set (#682)', () => {
  it('clears BOTH the Domain-scoped cookie and the host-only one', async () => {
    const host = 'admin.someconf.com'
    const set = settingCookie(await getForHost(host, [setCookie()]))
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

  it('clears host-only AND the legacy widened scope when the host is denylisted', async () => {
    // `konf.app` joining the denylist orphans any `.konf.app` cookie a previous
    // release set; sign-out must remove that too, not just the host-only one.
    const cleared = await getForHost('tenant.konf.app', [clearCookie()])
    expect(cleared).toHaveLength(2)
    expect(cleared.map(domainOf)).toEqual([undefined, '.konf.app'])
    for (const cookie of cleared) expect(isClearing(cookie)).toBe(true)
  })

  it('emits a single host-only clear where nothing could have been widened', async () => {
    const cleared = await getForHost('localhost:3000', [
      clearCookie(BARE_COOKIE),
    ])
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
    expect(domainOf(settingCookie(out.headers.getSetCookie()))).toBe(
      '.someconf.com',
    )
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

describe('counter-scope migration — a stale cookie in the OTHER scope (#682)', () => {
  it('clears the HOST-ONLY cookie when the write is widened', async () => {
    // Two scopes can coexist; the browser would send both and Auth.js reads the
    // one listed first (the older, unrefreshed copy), freezing the session.
    const cookies = await getForHost('admin.someconf.com', [setCookie()])
    const clears = cookies.filter(isClearing)

    expect(domainOf(settingCookie(cookies))).toBe('.someconf.com')
    expect(clears).toHaveLength(1)
    expect(domainOf(clears[0])).toBeUndefined()
    expect(setCookieNameOf(clears[0])).toBe(SECURE_COOKIE)
    // A delete must match the cookie's Path to remove it.
    expect(clears[0]).toContain('Path=/')
  })

  it('clears the WIDENED cookie when the host is (newly) denylisted', async () => {
    // The migration path this PR creates: `konf.app` joins the denylist, so a
    // `.konf.app` cookie set by the previous release must be actively removed.
    const cookies = await getForHost('tenant.konf.app', [setCookie()])
    const clears = cookies.filter(isClearing)

    expect(domainOf(settingCookie(cookies))).toBeUndefined()
    expect(clears).toHaveLength(1)
    expect(domainOf(clears[0])).toBe('.konf.app')
  })

  it('emits no counter-scope clear where nothing could have been widened', async () => {
    for (const host of ['localhost', 'localhost:3000', '127.0.0.1']) {
      const cookies = await getForHost(host, [setCookie()])
      expect(cookies.filter(isClearing), `host ${host}`).toHaveLength(0)
      expect(domainOf(settingCookie(cookies))).toBeUndefined()
    }
  })

  it('never lets the counter-scope clear cancel the cookie being set', async () => {
    // Distinct cookies: a Set-Cookie WITHOUT Domain can only ever delete a
    // host-only cookie, never the Domain-scoped one issued alongside it.
    const cookies = await getForHost('admin.someconf.com', [setCookie()])
    const set = settingCookie(cookies)
    expect(set).toContain('jwt.token.value')
    expect(isClearing(set)).toBe(false)
    for (const clear of cookies.filter(isClearing)) {
      expect(domainOf(clear)).not.toBe(domainOf(set))
    }
  })
})

describe('standalone auth(handler) API routes are covered too (#682)', () => {
  // `export const POST = auth(async (req) => …)` (travel-support receipts,
  // proposal attachments) never passes through the proxy matcher, but next-auth
  // still appends its rolling session cookie to the response. Wrapping `auth`
  // itself — not each call site — is what stops a new route from silently
  // issuing a competing host-only cookie.
  const route = auth(
    (async () => new Response('ok')) as unknown as Parameters<typeof auth>[0],
  ) as unknown as (req: NextRequest, ctx: unknown) => Promise<Response>

  async function postFromHost(host: string): Promise<string[]> {
    const req = new NextRequest('https://ignored.example/api/upload/x', {
      method: 'POST',
      headers: {
        'x-forwarded-host': host,
        'x-mock-set-cookie': JSON.stringify([setCookie()]),
      },
    })
    const res = await route(req, { params: Promise.resolve({}) })
    return res.headers.getSetCookie()
  }

  it('scopes the rolling cookie to the ACTUAL host on an auth() route', async () => {
    expect(
      domainOf(settingCookie(await postFromHost('admin.someconf.com'))),
    ).toBe('.someconf.com')
    expect(
      domainOf(settingCookie(await postFromHost('admin.cloudnativedays.no'))),
    ).toBe('.cloudnativedays.no')
    expect(
      domainOf(settingCookie(await postFromHost('tenant.konf.app'))),
    ).toBeUndefined()
  })

  it('still returns a FUNCTION from auth(handler) — the #671 contract', () => {
    expect(typeof route).toBe('function')
  })
})
