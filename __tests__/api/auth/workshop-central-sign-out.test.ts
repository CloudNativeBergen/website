/**
 * @vitest-environment node
 *
 * SIGN-OUT of the workshop portal (#1315, spec §7): the tenant host ends its
 * own session and sends the browser to the auth host, which ends the WorkOS
 * login and brings the browser back to the tenant host's front page.
 *
 * REAL: the sign-out action, both auth-host routes, the four routes of the
 * sign-in that every session here comes from, the destination policy, the seal
 * (`jose`, alias defeated) and `@workos-inc/node`, which builds the logout URL.
 * SUPPLIED: the host's record with its conference (`getDomainClaim`), the
 * workshop feature gate, and WorkOS's token endpoint (`authenticateWithCode`).
 *
 * Every refusal is the genuine step with ONE condition changed.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { DomainClaim } from '@/lib/domain-verification/types'
import { claimsById, provenClaim } from '../../helpers/domainClaims'
import {
  beginRequest,
  presentCookie,
  writtenCookies,
} from '../../helpers/nextHeadersJar'

vi.mock('jose', async () => (await import('../../helpers/realJose')).realJose())

const getDomainClaim = vi.fn<(id: string) => Promise<DomainClaim | null>>()
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: (id: string) => getDomainClaim(id),
}))

const getConferenceForDomain = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: (domain: string) => getConferenceForDomain(domain),
}))

const isWorkshopsEnabledForConference =
  vi.fn<(c: unknown) => Promise<boolean>>()
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: (c: unknown) =>
    isWorkshopsEnabledForConference(c),
}))

vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url })
  },
}))

import { signOutOfWorkshop } from '@/app/(workshop)/workshop/actions'
import { GET as signOutRoute } from '@/app/api/auth/workshop/sign-out/route'
import { GET as signedOutRoute } from '@/app/api/auth/workshop/signed-out/route'
import { seal, unseal } from '@/lib/workshop/central-sign-in/seal'
import { workshopWorkOS } from '@/lib/workshop/central-sign-in/workos'
import { handOff, signIn } from '../../helpers/workshopFlow'

const AUTH = 'auth.example.org'
const TENANT = 'conf.example.org'
const OTHER = 'other.example.org'
const SESSION_COOKIE = '__Host-workshop-session'
const RETURN_COOKIE = '__Host-workshop-sign-out'
const SESSION_CLEARED = `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax`
const RETURN_CLEARED = `${RETURN_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax`
/** The one sign-out redirect registered at WorkOS. */
const RETURN_ADDRESS = `https://${AUTH}/api/auth/workshop/signed-out`
const WORKOS_SESSION = 'session_01'

/** An access token as WorkOS issues it: a JWT whose `sid` is the session. */
function accessToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.signature`
}

const exchangeCode = vi.spyOn(
  workshopWorkOS().userManagement,
  'authenticateWithCode',
)
const buildLogoutUrl = vi.spyOn(workshopWorkOS().userManagement, 'getLogoutUrl')
/** Every network call there is. The exchange above is stubbed, so: none. */
const network = vi.spyOn(globalThis, 'fetch')

const anything = z.looseObject({})

function get(url: string | URL, host: string, cookie?: string | null) {
  const headers = new Headers({ host })
  if (cookie) headers.set('cookie', cookie)
  return new NextRequest(url, { headers })
}

/**
 * Press "Sign Out" on `on` in a browser that sends `session` (`name=value`).
 * Answers where the action sends the browser.
 */
async function pressSignOut(
  session: string | null,
  on = TENANT,
): Promise<string> {
  beginRequest(new Headers({ host: on }))
  if (session) {
    const at = session.indexOf('=')
    presentCookie(session.slice(0, at), session.slice(at + 1))
  }
  const thrown = await signOutOfWorkshop().then(
    () => null,
    (error: { url?: string }) => error,
  )
  expect(thrown?.url).toBeTypeOf('string')
  return thrown!.url!
}

/** Forget what signing in spent: count the next step alone. */
function fromHere() {
  getDomainClaim.mockClear()
  network.mockClear()
  exchangeCode.mockClear()
}

/** A signed-in attendee on `host` pressing "Sign Out" there. */
async function signedInThenOut(host = TENANT, on = AUTH): Promise<string> {
  const session = await signIn(host, on)
  fromHere()
  return pressSignOut(session, host)
}

/** The first cookie a response sets, as the browser sends it back. */
function firstCookie(response: Response): string {
  return response.headers.getSetCookie()[0].split(';')[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  beginRequest()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}`)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  getDomainClaim.mockImplementation(
    claimsById(provenClaim(TENANT), provenClaim(OTHER)),
  )
  isWorkshopsEnabledForConference.mockResolvedValue(true)
  exchangeCode.mockResolvedValue({
    accessToken: accessToken({ sid: WORKOS_SESSION, sub: 'user_01' }),
    refreshToken: 'refresh_token_value',
    user: {
      id: 'user_01',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
  } as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('the tenant host: pressing "Sign Out"', () => {
  it('clears the session cookie and sends the browser to the auth host with one sealed request', async () => {
    const target = new URL(await signedInThenOut())

    expect(writtenCookies()).toEqual([SESSION_CLEARED])
    expect(target.origin + target.pathname).toBe(
      `https://${AUTH}/api/auth/workshop/sign-out`,
    )
    expect([...target.searchParams.keys()]).toEqual(['request'])
  })

  it('seals this host and the WorkOS session of the session it ends, for a minute', async () => {
    const now = Date.parse('2026-10-12T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const target = new URL(await signedInThenOut())

    expect(
      await unseal(
        'sign-out-request',
        target.searchParams.get('request'),
        anything,
      ),
    ).toEqual({
      host: TENANT,
      sessionId: WORKOS_SESSION,
      iat: now / 1000,
      exp: now / 1000 + 60,
    })
  })

  it('reads nothing and calls nothing', async () => {
    await signedInThenOut()

    expect(getDomainClaim).not.toHaveBeenCalled()
    expect(network).not.toHaveBeenCalled()
    expect(buildLogoutUrl).not.toHaveBeenCalled()
  })

  it('with no session: ends on the front page, and nothing is sealed or called', async () => {
    const seals = vi.spyOn(crypto.subtle, 'encrypt')

    expect(await pressSignOut(null)).toBe('/')

    expect(writtenCookies()).toEqual([SESSION_CLEARED])
    expect(seals).not.toHaveBeenCalled()
    expect(getDomainClaim).not.toHaveBeenCalled()
    expect(network).not.toHaveBeenCalled()
  })

  it('with a session that has run out: ends on the front page', async () => {
    const now = Date.parse('2026-10-12T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const session = await signIn(TENANT, AUTH)
    // One second short of seven days it still signs out through the auth host.
    vi.setSystemTime(now + (7 * 24 * 60 * 60 - 1) * 1000)
    expect(await pressSignOut(session)).toContain('/api/auth/workshop/sign-out')

    vi.setSystemTime(now + 7 * 24 * 60 * 60 * 1000)
    expect(await pressSignOut(session)).toBe('/')
    expect(writtenCookies()).toEqual([SESSION_CLEARED])
  })

  it('with a session sealed for another host: ends on the front page', async () => {
    const session = await signIn(OTHER, AUTH)
    // The same cookie on the host it was issued for does sign out there.
    expect(await pressSignOut(session, OTHER)).toContain(
      '/api/auth/workshop/sign-out',
    )

    expect(await pressSignOut(session, TENANT)).toBe('/')
    expect(writtenCookies()).toEqual([SESSION_CLEARED])
  })

  it('with a hand-off token in place of a session: ends on the front page', async () => {
    const { token } = await handOff(TENANT, AUTH)

    expect(await pressSignOut(`${SESSION_COOKIE}=${token}`)).toBe('/')
  })

  it('with WORKSHOP_AUTH_ORIGIN unset: the host is its own auth host', async () => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', '')
    const target = await signedInThenOut(TENANT, TENANT)

    expect(target).toMatch(/^\/api\/auth\/workshop\/sign-out\?request=[\w.-]+$/)
  })

  it('with a WORKSHOP_AUTH_ORIGIN that cannot be used: ends on the front page', async () => {
    const session = await signIn(TENANT, AUTH)
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}/path`)

    expect(await pressSignOut(session)).toBe('/')
    expect(writtenCookies()).toEqual([SESSION_CLEARED])
  })
})

/** The auth host's sign-out route answering a request as `overrides` change it. */
interface AuthSignOut {
  /** The `Host` header the request arrives with. */
  on?: string
  /** The `request` parameter as sent, in place of the genuine one. */
  request?: string | null
}

/** The browser arriving on the auth host from a genuine sign-out on `host`. */
async function arriveToSignOut(
  { on = AUTH, request }: AuthSignOut = {},
  host = TENANT,
) {
  const target = new URL(await signedInThenOut(host), `https://${on}`)
  const url = new URL(`https://${on}${target.pathname}`)
  const sent =
    request === undefined ? target.searchParams.get('request') : request
  if (sent !== null) url.searchParams.set('request', sent)
  fromHere()
  return signOutRoute(get(url, on))
}

/** The genuine sign-out request with fields changed, sealed as a tenant host seals. */
async function resealed(
  change: Record<string, unknown>,
  purpose: Parameters<typeof seal>[0] = 'sign-out-request',
  ttlSeconds = 60,
): Promise<string> {
  return seal(
    purpose,
    { host: TENANT, sessionId: WORKOS_SESSION, ...change },
    ttlSeconds,
  )
}

/** Not carried on, for exactly this reason: nothing reaches WorkOS. */
function expectNotSignedOutAtWorkOS(response: Response, reason: string) {
  expect(console.warn).toHaveBeenCalledExactlyOnceWith(
    `[workshop] sign-out refused: ${reason}`,
  )
  expect(response.status).toBe(404)
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.getSetCookie()).toEqual([])
  expect(buildLogoutUrl).not.toHaveBeenCalled()
  expect(network).not.toHaveBeenCalled()
  // A decision, not a crash that happened to answer the same.
  expect(console.error).not.toHaveBeenCalled()
}

describe('the auth host: ending the WorkOS login', () => {
  it('sends the browser to WorkOS’s logout with the session ID of the session and the fixed return address', async () => {
    const response = await arriveToSignOut()

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(
      'https://api.workos.com/user_management/sessions/logout',
    )
    expect(Object.fromEntries(location.searchParams)).toEqual({
      session_id: WORKOS_SESSION,
      return_to: RETURN_ADDRESS,
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('answers 404 to Next’s own fetch of a same-host redirect, and ends nothing', async () => {
    const target = await signedInThenOut()
    // The browser's navigation to the same address is carried on.
    expect((await signOutRoute(get(target, AUTH))).status).toBe(307)
    vi.clearAllMocks()

    const response = await signOutRoute(
      new NextRequest(target, {
        headers: new Headers({ host: AUTH, RSC: '1' }),
      }),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(buildLogoutUrl).not.toHaveBeenCalled()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('keeps the host in one host-only cookie with the __Host- prefix, for five minutes', async () => {
    const now = Date.parse('2026-10-12T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const response = await arriveToSignOut()

    const value = firstCookie(response).split('=')[1]
    expect(response.headers.getSetCookie()).toEqual([
      `${RETURN_COOKIE}=${value}; Path=/; Expires=Mon, 12 Oct 2026 10:05:00 GMT; Max-Age=300; Secure; HttpOnly; SameSite=lax`,
    ])
    expect(await unseal('sign-out-return', value, anything)).toEqual({
      host: TENANT,
      iat: now / 1000,
      exp: now / 1000 + 300,
    })
  })

  it('reads the host’s record once and calls nothing', async () => {
    await arriveToSignOut()

    expect(getDomainClaim).toHaveBeenCalledExactlyOnceWith(
      `domainVerification.${TENANT}`,
    )
    expect(network).not.toHaveBeenCalled()
  })

  it('still signs out for a conference that has turned workshops off', async () => {
    const session = await signIn(TENANT, AUTH)
    isWorkshopsEnabledForConference.mockResolvedValue(false)
    const target = await pressSignOut(session)

    const response = await signOutRoute(get(target, AUTH))

    expect(
      new URL(response.headers.get('location')!).searchParams.get('session_id'),
    ).toBe(WORKOS_SESSION)
  })

  it('refuses without a request, and reads nothing', async () => {
    const response = await arriveToSignOut({ request: null })

    expectNotSignedOutAtWorkOS(response, 'no-request')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('refuses a request that was changed', async () => {
    const genuine = new URL(await signedInThenOut()).searchParams.get(
      'request',
    )!
    // The ciphertext is the fourth of five parts: change one character of it.
    const parts = genuine.split('.')
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1)

    const response = await arriveToSignOut({ request: parts.join('.') })

    expectNotSignedOutAtWorkOS(response, 'no-request')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('refuses a request older than a minute', async () => {
    const now = Date.parse('2026-10-12T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const target = await signedInThenOut()
    // One second short of a minute it is still carried on.
    vi.setSystemTime(now + 59_000)
    expect((await signOutRoute(get(target, AUTH))).status).toBe(307)
    buildLogoutUrl.mockClear()

    vi.setSystemTime(now + 60_000)
    const response = await signOutRoute(get(target, AUTH))

    expectNotSignedOutAtWorkOS(response, 'no-request')
  })

  it.each(['session', 'handoff', 'start-request', 'sign-out-return'] as const)(
    'refuses a request sealed as %s',
    async (purpose) => {
      // The same fields sealed as a sign-out request are carried on.
      expect(
        (await arriveToSignOut({ request: await resealed({}) })).status,
      ).toBe(307)
      vi.clearAllMocks()

      const response = await arriveToSignOut({
        request: await resealed({}, purpose),
      })

      expectNotSignedOutAtWorkOS(response, 'no-request')
    },
  )

  it('refuses the genuine session cookie in place of a request', async () => {
    const session = await signIn(TENANT, AUTH)

    const response = await arriveToSignOut({
      request: session.slice(session.indexOf('=') + 1),
    })

    expectNotSignedOutAtWorkOS(response, 'no-request')
  })

  it('refuses a request that names no WorkOS session', async () => {
    const response = await arriveToSignOut({
      request: await resealed({ sessionId: '' }),
    })

    expectNotSignedOutAtWorkOS(response, 'no-request')
  })

  it('answers 404 on any host but the auth host, and reads nothing', async () => {
    const response = await arriveToSignOut({ on: TENANT })

    expectNotSignedOutAtWorkOS(response, 'host-refused')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it.each([
    ['a lookalike of the host', { host: `${TENANT}.evil.example.org` }],
    ['the host with a path a URL parser could read', { host: `${TENANT}/x` }],
    ['a wildcard', { host: '*.example.org' }],
  ])('refuses a request that names %s', async (_what, change) => {
    const response = await arriveToSignOut({ request: await resealed(change) })

    expectNotSignedOutAtWorkOS(response, 'host-refused')
  })

  it('refuses a lookalike even when the read answers with the proven host’s record', async () => {
    getDomainClaim.mockResolvedValue(provenClaim(TENANT))

    const response = await arriveToSignOut({
      request: await resealed({ host: `evil-${TENANT}` }),
    })

    expectNotSignedOutAtWorkOS(response, 'host-refused')
    expect(getDomainClaim).toHaveBeenCalledExactlyOnceWith(
      `domainVerification.evil-${TENANT}`,
    )
  })

  it.each<[string, DomainClaim | null]>([
    ['has no record', null],
    [
      'is grandfathered and was never proven',
      provenClaim(TENANT, {
        method: 'grandfathered',
        graceUntil: '2999-01-01T00:00:00Z',
      }),
    ],
    ['has a failing record', provenClaim(TENANT, { status: 'failing' })],
    [
      'is no longer claimed by its conference',
      provenClaim(TENANT, {}, { domains: ['elsewhere.example.org'] }),
    ],
  ])(
    'refuses a host that %s when the request arrives',
    async (_what, claim) => {
      const target = await signedInThenOut()
      getDomainClaim.mockResolvedValue(claim)

      const response = await signOutRoute(get(target, AUTH))

      expectNotSignedOutAtWorkOS(response, 'host-refused')
      expect(getDomainClaim).toHaveBeenCalledWith(
        `domainVerification.${TENANT}`,
      )
    },
  )

  it('refuses when the record cannot be read', async () => {
    const target = await signedInThenOut()
    const down = new Error('sanity is down')
    getDomainClaim.mockRejectedValue(down)

    const response = await signOutRoute(get(target, AUTH))

    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[workshop] sign-out refused: host-refused',
    )
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[domain-verification] destination read failed; refusing the host',
      down,
    )
    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(buildLogoutUrl).not.toHaveBeenCalled()
  })

  it('refuses with a WORKSHOP_AUTH_ORIGIN that cannot be used', async () => {
    const target = await signedInThenOut()
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}/path`)

    const response = await signOutRoute(get(target, AUTH))

    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[workshop] sign-out refused: host-refused',
    )
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[workshop] WORKSHOP_AUTH_ORIGIN is not a bare https origin of a hostname; workshop sign-in is refused on every host.',
    )
    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(buildLogoutUrl).not.toHaveBeenCalled()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  describe('with WORKSHOP_AUTH_ORIGIN unset', () => {
    beforeEach(() => vi.stubEnv('WORKSHOP_AUTH_ORIGIN', ''))

    it('the host ends its own login, and the return address is on it', async () => {
      const target = await signedInThenOut(TENANT, TENANT)

      const response = await signOutRoute(
        get(new URL(target, `https://${TENANT}`), TENANT),
      )

      expect(
        Object.fromEntries(
          new URL(response.headers.get('location')!).searchParams,
        ),
      ).toEqual({
        session_id: WORKOS_SESSION,
        return_to: `https://${TENANT}/api/auth/workshop/signed-out`,
      })
    })

    it('a request for one host is a 404 on another', async () => {
      const target = await signedInThenOut(TENANT, TENANT)

      const response = await signOutRoute(
        get(new URL(target, `https://${OTHER}`), OTHER),
      )

      expectNotSignedOutAtWorkOS(response, 'host-refused')
      expect(getDomainClaim).not.toHaveBeenCalled()
    })
  })
})

/** A genuine sign-out up to WorkOS: the auth host's cookie, `name=value`. */
async function sentToWorkOS(host = TENANT, on = AUTH): Promise<string> {
  const target = await signedInThenOut(host, on)
  const response = await signOutRoute(get(new URL(target, `https://${on}`), on))
  expect(response.status).toBe(307)
  fromHere()
  return firstCookie(response)
}

/** WorkOS sending the browser back to the return address on `on`. */
function comeBack(cookie: string | null, on = AUTH) {
  return signedOutRoute(
    get(`https://${on}/api/auth/workshop/signed-out`, on, cookie),
  )
}

/** A return cookie as the auth host seals it, naming `host`. */
async function returnCookie(
  host: string,
  purpose: Parameters<typeof seal>[0] = 'sign-out-return',
): Promise<string> {
  return `${RETURN_COOKIE}=${await seal(purpose, { host }, 300)}`
}

/** The plain page, for exactly this reason: no redirect, the cookie cleared. */
async function expectPlainPage(response: Response, reason: string) {
  expect(console.warn).toHaveBeenCalledExactlyOnceWith(
    `[workshop] signed-out refused: ${reason}`,
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.text()).toContain('<h1>You are signed out</h1>')
  expect(response.headers.getSetCookie()).toEqual([RETURN_CLEARED])
  expect(network).not.toHaveBeenCalled()
  expect(console.error).not.toHaveBeenCalled()
}

describe('the auth host: the return from WorkOS', () => {
  it('sends the browser to the front page of the host it signed out of, and clears its cookie', async () => {
    const response = await comeBack(await sentToWorkOS())

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`https://${TENANT}/`)
    expect(response.headers.getSetCookie()).toEqual([RETURN_CLEARED])
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(getDomainClaim).toHaveBeenCalledExactlyOnceWith(
      `domainVerification.${TENANT}`,
    )
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('takes the host from its cookie and from nothing in the address', async () => {
    const cookie = await sentToWorkOS()

    const response = await signedOutRoute(
      get(
        `https://${AUTH}/api/auth/workshop/signed-out?host=${OTHER}&return_to=https://${OTHER}/&state=${OTHER}`,
        AUTH,
        cookie,
      ),
    )

    expect(response.headers.get('location')).toBe(`https://${TENANT}/`)
  })

  it('shows the plain page without a cookie, and reads nothing', async () => {
    await sentToWorkOS()

    const response = await comeBack(null)

    await expectPlainPage(response, 'no-cookie')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('shows the plain page for a cookie older than five minutes', async () => {
    const now = Date.parse('2026-10-12T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const cookie = await sentToWorkOS()
    // One second short of five minutes the browser is still sent back.
    vi.setSystemTime(now + 299_000)
    expect((await comeBack(cookie)).headers.get('location')).toBe(
      `https://${TENANT}/`,
    )
    fromHere()

    vi.setSystemTime(now + 300_000)
    const response = await comeBack(cookie)

    await expectPlainPage(response, 'no-cookie')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('shows the plain page for a cookie that was changed', async () => {
    const cookie = await sentToWorkOS()
    const parts = cookie.split('.')
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1)

    const response = await comeBack(parts.join('.'))

    await expectPlainPage(response, 'no-cookie')
  })

  it.each(['sign-out-request', 'session', 'handoff'] as const)(
    'shows the plain page for a cookie sealed as %s',
    async (purpose) => {
      // The same host sealed as a return cookie is gone back to.
      expect(
        (await comeBack(await returnCookie(TENANT))).headers.get('location'),
      ).toBe(`https://${TENANT}/`)
      vi.clearAllMocks()

      const response = await comeBack(await returnCookie(TENANT, purpose))

      await expectPlainPage(response, 'no-cookie')
    },
  )

  it('shows the plain page for a cookie that holds the bare host, unsealed', async () => {
    const response = await comeBack(`${RETURN_COOKIE}=${TENANT}`)

    await expectPlainPage(response, 'no-cookie')
  })

  it.each([
    ['a lookalike of a proven host', `${TENANT}.evil.example.org`],
    [
      'a proven host with a path a URL parser could read',
      `${TENANT}/@evil.example.org`,
    ],
    ['a host with no record', 'unknown.example.org'],
  ])('shows the plain page for a cookie naming %s', async (_what, host) => {
    const response = await comeBack(await returnCookie(host))

    await expectPlainPage(response, 'host-refused')
  })

  it('shows the plain page for a lookalike even when the read answers with the proven host’s record', async () => {
    getDomainClaim.mockResolvedValue(provenClaim(TENANT))

    const response = await comeBack(await returnCookie(`evil-${TENANT}`))

    await expectPlainPage(response, 'host-refused')
    expect(getDomainClaim).toHaveBeenCalledExactlyOnceWith(
      `domainVerification.evil-${TENANT}`,
    )
  })

  it.each<[string, DomainClaim | null]>([
    ['has lost its record', null],
    [
      'is grandfathered and was never proven',
      provenClaim(TENANT, {
        method: 'grandfathered',
        graceUntil: '2999-01-01T00:00:00Z',
      }),
    ],
    ['has a failing record', provenClaim(TENANT, { status: 'failing' })],
    [
      'is no longer claimed by its conference',
      provenClaim(TENANT, {}, { domains: ['elsewhere.example.org'] }),
    ],
  ])(
    'shows the plain page for a host that %s by the time WorkOS returns',
    async (_what, claim) => {
      const cookie = await sentToWorkOS()
      getDomainClaim.mockResolvedValue(claim)

      const response = await comeBack(cookie)

      await expectPlainPage(response, 'host-refused')
      expect(getDomainClaim).toHaveBeenCalledExactlyOnceWith(
        `domainVerification.${TENANT}`,
      )
    },
  )

  it('answers 404 on any host but the auth host: nothing read, no cookie touched', async () => {
    const cookie = await sentToWorkOS()

    const response = await comeBack(cookie, TENANT)

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('answers 404 with a WORKSHOP_AUTH_ORIGIN that cannot be used', async () => {
    const cookie = await sentToWorkOS()
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}/path`)

    const response = await comeBack(cookie)

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  describe('with WORKSHOP_AUTH_ORIGIN unset', () => {
    beforeEach(() => vi.stubEnv('WORKSHOP_AUTH_ORIGIN', ''))

    it('the host returns to its own front page', async () => {
      const response = await comeBack(
        await sentToWorkOS(TENANT, TENANT),
        TENANT,
      )

      expect(response.headers.get('location')).toBe(`https://${TENANT}/`)
      expect(response.headers.getSetCookie()).toEqual([RETURN_CLEARED])
    })

    it('a cookie naming another proven host shows the plain page, and reads nothing', async () => {
      const response = await comeBack(await returnCookie(OTHER), TENANT)

      await expectPlainPage(response, 'host-refused')
      expect(getDomainClaim).not.toHaveBeenCalled()
    })
  })
})

describe('in development, over plain HTTP', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'http://127.0.0.1:3000')
    getConferenceForDomain.mockResolvedValue({
      conference: { _id: 'conference-1', domains: ['localhost:3000'] },
      error: null,
    })
  })

  it('signs out through the auth host with cookies a browser stores without TLS', async () => {
    const session = await signIn('localhost:3000', '127.0.0.1:3000')
    const target = await pressSignOut(session, 'localhost:3000')
    expect(writtenCookies()).toEqual([
      'workshop-session=; Path=/; Max-Age=0; HttpOnly; SameSite=lax',
    ])

    const sent = await signOutRoute(get(target, '127.0.0.1:3000'))
    expect(
      new URL(sent.headers.get('location')!).searchParams.get('return_to'),
    ).toBe('http://127.0.0.1:3000/api/auth/workshop/signed-out')
    expect(sent.headers.getSetCookie()[0]).toMatch(
      /^workshop-sign-out=[\w.-]+; Path=\/; Expires=[^;]+; Max-Age=300; HttpOnly; SameSite=lax$/,
    )

    const back = await signedOutRoute(
      get(
        'http://127.0.0.1:3000/api/auth/workshop/signed-out',
        '127.0.0.1:3000',
        firstCookie(sent),
      ),
    )
    expect(back.headers.get('location')).toBe('http://localhost:3000/')
  })
})
