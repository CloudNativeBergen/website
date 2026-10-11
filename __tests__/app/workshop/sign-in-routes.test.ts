/**
 * @vitest-environment node
 *
 * `GET /workshop/sign-in` and `GET /workshop/sign-up` on a tenant host: the
 * first step of a workshop sign-in (#1314, spec §3 step 1). They keep a random
 * value in a cookie and send the browser to the auth host with a sealed
 * request that names this host, the hash of the value and the screen.
 *
 * REAL: both routes, the destination policy and the seal (`jose`, alias
 * defeated).
 * SUPPLIED: the host's record with its conference (`getDomainClaim`) and the
 * workshop feature gate.
 *
 * Every refusal is `begin()` with ONE condition changed.
 */
import '../../helpers/workosEnv'
import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { DomainClaim } from '@/lib/domain-verification/types'
import { claimsById, provenClaim } from '../../helpers/domainClaims'

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

import { GET as signIn } from '@/app/(workshop)/workshop/sign-in/route'
import { GET as signUp } from '@/app/(workshop)/workshop/sign-up/route'
import { unseal } from '@/lib/workshop/central-sign-in/seal'

const AUTH = 'auth.example.org'
const TENANT = 'conf.example.org'
const COOKIE = '__Host-workshop-sign-in'

const anything = z.looseObject({})

/** A visitor pressing one of the two buttons on `on`. */
function begin(on = TENANT, route = signIn, path = '/workshop/sign-in') {
  return route(
    new NextRequest(`https://${on}${path}`, {
      headers: new Headers({ host: on }),
    }),
  )
}

/** The sealed request the auth host is sent, as its start route will read it. */
async function sentRequest(response: Response) {
  const sealed = new URL(response.headers.get('location')!).searchParams.get(
    'request',
  )
  return unseal('start-request', sealed, anything)
}

function cookieValue(response: Response): string {
  return response.headers.getSetCookie()[0].split(';')[0].split('=')[1]
}

function expectNothingBegun(response: Response) {
  expect(response.headers.getSetCookie()).toEqual([])
  expect(response.headers.get('location') ?? '').not.toContain('request=')
  // A decision, not a crash that happened to answer the same.
  expect(console.error).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}`)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getDomainClaim.mockImplementation(claimsById(provenClaim(TENANT)))
  isWorkshopsEnabledForConference.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('sign-in on a proven tenant host', () => {
  it('sends the browser to the auth host’s start route with one sealed request', async () => {
    const response = await begin()

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(
      `https://${AUTH}/api/auth/workshop/start`,
    )
    expect([...location.searchParams.keys()]).toEqual(['request'])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('keeps a random value in one host-only cookie with the __Host- prefix, for ten minutes', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00Z') })
    const response = await begin()

    const value = cookieValue(response)
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(response.headers.getSetCookie()).toEqual([
      `${COOKIE}=${value}; Path=/; Expires=Mon, 12 Oct 2026 10:10:00 GMT; Max-Age=600; Secure; HttpOnly; SameSite=lax`,
    ])
  })

  it('seals this host, the screen and the hash of the value, never the value', async () => {
    const response = await begin()

    const value = cookieValue(response)
    expect(await sentRequest(response)).toMatchObject({
      host: TENANT,
      screen: 'sign-in',
      challenge: createHash('sha256').update(value).digest('base64url'),
    })
    expect(response.headers.get('location')).not.toContain(value)
  })

  it('the sealed request lasts 60 seconds', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00Z') })
    const sent = await sentRequest(await begin())

    const issued = Date.parse('2026-10-12T10:00:00Z') / 1000
    expect(sent).toMatchObject({ iat: issued, exp: issued + 60 })
  })

  it('a second sign-in gets a value of its own', async () => {
    const first = cookieValue(await begin())
    const second = cookieValue(await begin())

    expect(second).not.toBe(first)
  })

  it('sign-up asks for the sign-up screen', async () => {
    const response = await begin(TENANT, signUp, '/workshop/sign-up')

    expect(response.status).toBe(307)
    expect(await sentRequest(response)).toMatchObject({
      host: TENANT,
      screen: 'sign-up',
    })
  })

  it('asks the feature gate about the conference that claims the host', async () => {
    await begin()

    expect(isWorkshopsEnabledForConference).toHaveBeenCalledWith(
      provenClaim(TENANT).conference,
    )
  })

  it('reads the host’s record once', async () => {
    await begin()

    expect(getDomainClaim).toHaveBeenCalledOnce()
  })

  it('keeps the sign-in cookie scoped to its host', async () => {
    const response = await begin()

    expect(response.status).toBe(307)
    expect(response.headers.getSetCookie()[0]).not.toMatch(/domain/i)
  })
})

describe('sign-in: nothing is begun', () => {
  it.each([
    ['sign-in', signIn, '/workshop/sign-in'],
    ['sign-up', signUp, '/workshop/sign-up'],
  ])(
    '%s on the auth host is a 404, without reading a record',
    async (_name, route, path) => {
      const response = await begin(AUTH, route, path)

      expect(response.status).toBe(404)
      expectNothingBegun(response)
      expect(getDomainClaim).not.toHaveBeenCalled()
    },
  )

  it('a proven host whose name only ends with the auth host’s is a tenant host', async () => {
    const LOOKALIKE = `my-${AUTH}`
    getDomainClaim.mockImplementation(claimsById(provenClaim(LOOKALIKE)))

    const response = await begin(LOOKALIKE)

    expect(response.status).toBe(307)
    expect(await sentRequest(response)).toMatchObject({ host: LOOKALIKE })
  })

  it('the auth host in another case is still the auth host', async () => {
    const response = await begin('AUTH.Example.org')

    expect(response.status).toBe(404)
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('a host that is not proven goes to the portal page, which says sign-in is unavailable', async () => {
    getDomainClaim.mockResolvedValue(null)

    const response = await begin()

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expectNothingBegun(response)
  })

  it('a conference without workshops is a 404', async () => {
    isWorkshopsEnabledForConference.mockResolvedValue(false)

    const response = await begin()

    expect(response.status).toBe(404)
    expectNothingBegun(response)
  })
})

describe('sign-in: WORKSHOP_AUTH_ORIGIN', () => {
  it('unset: the host is its own auth host', async () => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', '')

    const response = await begin()

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(
      `https://${TENANT}/api/auth/workshop/start`,
    )
  })

  it('unusable: nothing is begun on any host', async () => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `http://${AUTH}`)

    const response = await begin()

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('development: a cookie a browser will store over plain http', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00Z') })
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'http://127.0.0.1:3000')
    getConferenceForDomain.mockResolvedValue({
      conference: { _id: 'conference-1', domains: ['localhost:3000'] },
      error: null,
    })

    const response = await signIn(
      new NextRequest('http://localhost:3000/workshop/sign-in', {
        headers: new Headers({ host: 'localhost:3000' }),
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toMatch(
      /^http:\/\/127\.0\.0\.1:3000\/api\/auth\/workshop\/start\?request=/,
    )
    const value = cookieValue(response)
    expect(response.headers.getSetCookie()).toEqual([
      `workshop-sign-in=${value}; Path=/; Expires=Mon, 12 Oct 2026 10:10:00 GMT; Max-Age=600; HttpOnly; SameSite=lax`,
    ])
  })
})
