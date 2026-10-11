/**
 * @vitest-environment node
 *
 * `GET /workshop/redeem` on a tenant host: the hand-off token becomes this
 * host's own session (#1314, spec §3 step 4, §5, §6).
 *
 * REAL: all four routes (every hand-off is one the auth host issued for a
 * sign-in begun on the tenant host), the destination policy, the seal (`jose`,
 * alias defeated) and `@workos-inc/node`.
 * SUPPLIED: the host's record with its conference (`getDomainClaim`), the
 * workshop feature gate, and WorkOS's token endpoint (`authenticateWithCode`).
 *
 * Every refusal is a genuine, complete sign-in with ONE condition changed.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { DomainClaim } from '@/lib/domain-verification/types'
import {
  CLAIMING_CONFERENCE_ID,
  claimsById,
  provenClaim,
} from '../../helpers/domainClaims'

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

import { GET } from '@/app/(workshop)/workshop/redeem/route'
import { isPlatformControlledHost } from '@/lib/domain-verification/platform-controlled'
import { seal, unseal } from '@/lib/workshop/central-sign-in/seal'
import { workshopWorkOS } from '@/lib/workshop/central-sign-in/workos'
import { handOff as handOffOn, type HandOff } from '../../helpers/workshopFlow'

const AUTH = 'auth.example.org'
const TENANT = 'conf.example.org'
const ALLOCATED = 'tenant.konf.run'
const SIGN_IN_COOKIE = '__Host-workshop-sign-in'
const SESSION_COOKIE = '__Host-workshop-session'
const REFUSED = '/workshop?sign-in=incomplete'
const WEEK = 7 * 24 * 60 * 60

/** An access token as WorkOS issues it: a JWT whose `sid` is the session. */
function accessToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.signature`
}

const AUTHENTICATED = {
  accessToken: accessToken({ sid: 'session_01', sub: 'user_01' }),
  refreshToken: 'refresh_token_value',
  user: {
    id: 'user_01',
    email: 'ada@example.com',
    emailVerified: true,
    firstName: 'Ada',
    lastName: 'Lovelace',
  },
}

const exchangeCode = vi.spyOn(
  workshopWorkOS().userManagement,
  'authenticateWithCode',
)

/** A whole sign-in for `host`, up to the hand-off. */
const handOff = (host = TENANT, on = AUTH) => handOffOn(host, on)

interface Redeem {
  on?: string
  token?: string | null
  /** The cookies the browser sends, `name=value`. */
  cookie?: string | null
  /** Extra query parameters, as an attacker or a bug might add them. */
  query?: Record<string, string>
}

/** The browser arriving on the tenant host from the auth host. */
function redeem(
  handedOff: HandOff,
  {
    on = TENANT,
    token = handedOff.token,
    cookie = handedOff.browser,
    query,
  }: Redeem = {},
) {
  const scheme = process.env.NODE_ENV === 'development' ? 'http' : 'https'
  const url = new URL(`${scheme}://${on}/workshop/redeem`)
  if (token !== null) url.searchParams.set('token', token)
  for (const [name, value] of Object.entries(query ?? {})) {
    url.searchParams.set(name, value)
  }
  const headers = new Headers({ host: on })
  if (cookie !== null) headers.set('cookie', cookie)
  return GET(new NextRequest(url, { headers }))
}

const anything = z.looseObject({})

/** The session a response set, as sealed. */
function sessionOf(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${SESSION_COOKIE}=`))
    ?.split(';')[0]
    .split('=')[1]
}

/** The genuine token with one field changed, sealed as the auth host seals. */
async function resealed(
  handedOff: HandOff,
  change: Record<string, unknown>,
  purpose: Parameters<typeof seal>[0] = 'handoff',
): Promise<string> {
  const {
    iat: _iat,
    exp: _exp,
    ...payload
  } = (await unseal('handoff', handedOff.token, anything))!
  return seal(purpose, { ...payload, ...change }, 60)
}

/** Refused, for exactly this reason: the one line the log gets. */
function expectRefused(response: Response, reason: string) {
  expect(console.warn).toHaveBeenCalledExactlyOnceWith(
    `[workshop] redeem refused: ${reason}`,
  )
  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toBe(REFUSED)
  expect(response.headers.getSetCookie()).toEqual([])
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  // A decision, not a crash that happened to answer the same.
  expect(console.error).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
  vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}`)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  getDomainClaim.mockImplementation(
    claimsById(
      provenClaim(TENANT),
      provenClaim(ALLOCATED, { method: 'platform-owned' }),
    ),
  )
  isWorkshopsEnabledForConference.mockResolvedValue(true)
  exchangeCode.mockResolvedValue(AUTHENTICATED as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('redeem: a hand-off for this host, in the browser that began', () => {
  it('sets the session in one host-only cookie with the __Host- prefix for 7 days, and clears the first cookie', async () => {
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-10-12T10:00:00Z'),
    })
    const response = await redeem(await handOff())

    const session = sessionOf(response)
    expect(response.headers.getSetCookie()).toEqual([
      `${SESSION_COOKIE}=${session}; Path=/; Expires=Mon, 19 Oct 2026 10:00:00 GMT; Max-Age=${WEEK}; Secure; HttpOnly; SameSite=lax`,
      `${SIGN_IN_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax`,
    ])
  })

  it('lands on /workshop, whatever the query string asks for', async () => {
    const response = await redeem(await handOff(), {
      query: {
        returnTo: 'https://evil.example.net/',
        redirect: '/admin',
        next: '//evil.example.net',
        'sign-in': 'incomplete',
      },
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
  })

  it('is not to be stored and sends no referrer: the token is in the URL', async () => {
    const response = await redeem(await handOff())

    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('seals who signed in, for this host and conference, as a session that ends 7 days from now', async () => {
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-10-12T10:00:00Z'),
    })
    const session = sessionOf(await redeem(await handOff()))

    const issued = Date.parse('2026-10-12T10:00:00Z') / 1000
    expect(await unseal('handoff', session, anything)).toBeNull()
    expect(await unseal('session', session, anything)).toEqual({
      userId: 'user_01',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      sessionId: 'session_01',
      host: TENANT,
      conferenceId: CLAIMING_CONFERENCE_ID,
      iat: issued,
      exp: issued + WEEK,
    })
  })

  it('reads the host’s record once and never calls WorkOS', async () => {
    const handedOff = await handOff()
    getDomainClaim.mockClear()
    exchangeCode.mockClear()

    isWorkshopsEnabledForConference.mockClear()

    await redeem(handedOff)

    expect(getDomainClaim).toHaveBeenCalledOnce()
    expect(exchangeCode).not.toHaveBeenCalled()
    // The feature gate is asked about the conference that claims the host.
    expect(isWorkshopsEnabledForConference.mock.calls).toEqual([
      [provenClaim(TENANT).conference],
    ])
  })

  it('WORKOS_COOKIE_DOMAIN adds no Domain to either cookie', async () => {
    vi.stubEnv('WORKOS_COOKIE_DOMAIN', 'example.org')

    const response = await redeem(await handOff())

    expect(sessionOf(response)).toBeDefined()
    expect(response.headers.getSetCookie().join('\n')).not.toMatch(/domain/i)
  })

  it('a conference on its own proven domain, owned by another organization than the platform’s, signs in', async () => {
    const own = provenClaim(
      TENANT,
      { method: 'dns-txt' },
      { organization: { _ref: 'org-of-the-tenant' } },
    )
    getDomainClaim.mockImplementation(claimsById(own))
    // The rule this replaces refused exactly this host.
    expect(
      isPlatformControlledHost(own.record, 'org-of-the-tenant', new Date()),
    ).toBe(false)

    const response = await redeem(await handOff())

    expect(response.headers.get('location')).toBe('/workshop')
    expect(
      await unseal('session', sessionOf(response), anything),
    ).toMatchObject({ host: TENANT, userId: 'user_01' })
  })

  it('reads the Host header in any case', async () => {
    const response = await redeem(await handOff(), { on: 'Conf.Example.ORG' })

    expect(response.headers.get('location')).toBe('/workshop')
    expect(sessionOf(response)).toBeDefined()
  })

  it('a host the platform allocated signs in', async () => {
    const response = await redeem(await handOff(ALLOCATED), { on: ALLOCATED })

    expect(
      await unseal('session', sessionOf(response), anything),
    ).toMatchObject({ host: ALLOCATED })
  })
})

describe('redeem: refused, no session, back to /workshop signed out', () => {
  it('without the browser’s cookie, without reading a record', async () => {
    const handedOff = await handOff()
    getDomainClaim.mockClear()

    expectRefused(await redeem(handedOff, { cookie: null }), 'no-cookie')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('with a cookie that hashes to another value, without reading a record', async () => {
    const first = await handOff()
    const second = await handOff()
    getDomainClaim.mockClear()

    expectRefused(await redeem(first, { cookie: second.browser }), 'no-cookie')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('with the hash itself as the cookie: the cookie must hash to it, not equal it', async () => {
    const handedOff = await handOff()
    const { challenge } = (await unseal(
      'handoff',
      handedOff.token,
      z.object({ challenge: z.string() }),
    ))!

    expectRefused(
      await redeem(handedOff, { cookie: `${SIGN_IN_COOKIE}=${challenge}` }),
      'no-cookie',
    )
  })

  it('with a cookie whose hash only begins like the one in the token', async () => {
    const handedOff = await handOff()
    const { challenge } = (await unseal(
      'handoff',
      handedOff.token,
      z.object({ challenge: z.string() }),
    ))!
    // The genuine cookie, against a token whose hash shares its first half.
    const token = await resealed(handedOff, {
      challenge: challenge.slice(0, 21) + 'x'.repeat(22),
    })

    expectRefused(await redeem(handedOff, { token }), 'no-cookie')
  })

  it('with the cookie under a name without the __Host- prefix', async () => {
    const handedOff = await handOff()

    expectRefused(
      await redeem(handedOff, {
        cookie: handedOff.browser.replace(SIGN_IN_COOKIE, 'workshop-sign-in'),
      }),
      'no-cookie',
    )
  })

  it('a token for another host, without reading a record', async () => {
    const handedOff = await handOff()
    const token = await resealed(handedOff, { host: ALLOCATED })
    getDomainClaim.mockClear()

    expectRefused(await redeem(handedOff, { token }), 'other-host')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('a token for this host issued while another conference claimed it', async () => {
    const handedOff = await handOff()
    getDomainClaim.mockImplementation(
      claimsById(
        provenClaim(
          TENANT,
          { conferenceId: 'conference-2' },
          { _id: 'conference-2' },
        ),
      ),
    )

    expectRefused(await redeem(handedOff), 'conference-changed')
  })

  it('a token older than 60 seconds', async () => {
    const now = new Date('2026-10-12T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const handedOff = await handOff()

    vi.setSystemTime(now.getTime() + 59_000)
    expect((await redeem(handedOff)).headers.get('location')).toBe('/workshop')
    expect(console.warn).not.toHaveBeenCalled()
    vi.setSystemTime(now.getTime() + 61_000)
    expectRefused(await redeem(handedOff), 'no-hand-off')
  })

  it('a token that was changed on the way', async () => {
    const handedOff = await handOff()
    // One character of the ciphertext, the fourth of a compact JWE's five parts.
    const parts = handedOff.token.split('.')
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1)

    expectRefused(
      await redeem(handedOff, { token: parts.join('.') }),
      'no-hand-off',
    )
  })

  it('a sealed session presented as a token', async () => {
    const handedOff = await handOff()
    const token = await resealed(handedOff, {}, 'session')

    expectRefused(await redeem(handedOff, { token }), 'no-hand-off')
  })

  it('without a token', async () => {
    expectRefused(await redeem(await handOff(), { token: null }), 'no-hand-off')
  })

  it('a host that no longer passes the destination check', async () => {
    const handedOff = await handOff()
    getDomainClaim.mockImplementation(
      claimsById(provenClaim(TENANT, { status: 'failing' })),
    )

    expectRefused(await redeem(handedOff), 'host-refused')
  })

  it('a conference whose workshops were switched off since the hand-off', async () => {
    const handedOff = await handOff()
    isWorkshopsEnabledForConference.mockResolvedValue(false)

    expectRefused(await redeem(handedOff), 'no-workshops')
  })

  it('on the auth host: a 404, without reading a record', async () => {
    const handedOff = await handOff()
    getDomainClaim.mockClear()

    const response = await redeem(handedOff, { on: AUTH })

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(getDomainClaim).not.toHaveBeenCalled()
  })
})

describe('redeem: WORKSHOP_AUTH_ORIGIN unset', () => {
  it('a host signs in through itself', async () => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', '')

    const response = await redeem(await handOff(TENANT, TENANT))

    expect(response.headers.get('location')).toBe('/workshop')
    expect(
      await unseal('session', sessionOf(response), anything),
    ).toMatchObject({ host: TENANT })
  })
})

describe('redeem: development, two local origins over plain http', () => {
  it('localhost takes the hand-off from 127.0.0.1 in cookies a browser will store', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'http://127.0.0.1:3000')
    getConferenceForDomain.mockResolvedValue({
      conference: { _id: 'conference-local', domains: ['localhost:3000'] },
      error: null,
    })

    const response = await redeem(
      await handOff('localhost:3000', '127.0.0.1:3000'),
      { on: 'localhost:3000' },
    )

    expect(response.headers.get('location')).toBe('/workshop')
    const [session, cleared] = response.headers.getSetCookie()
    expect(session).toMatch(
      /^workshop-session=[^;]+; Path=\/; Expires=[^;]+; Max-Age=604800; HttpOnly; SameSite=lax$/,
    )
    expect(cleared).toBe(
      'workshop-sign-in=; Path=/; Max-Age=0; HttpOnly; SameSite=lax',
    )
  })
})
