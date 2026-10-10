/**
 * @vitest-environment node
 *
 * `GET /api/auth/workshop/start`: the auth host starts a workshop sign-in for
 * a tenant host (#1313, spec §3 step 2).
 *
 * REAL: the route, the destination policy, the seal (`jose`, alias defeated)
 * and `@workos-inc/node`, which builds the authorize URL and the PKCE pair.
 * SUPPLIED: the host's record with its conference (`getDomainClaim`) and the
 * workshop feature gate.
 *
 * Every refusal is `start()` with ONE condition changed.
 */
import '../../helpers/workosEnv'
import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { DomainClaim } from '@/lib/domain-verification/types'
import {
  CLAIMING_CONFERENCE_ID,
  claimsById,
  provenClaim,
} from '../../helpers/domainClaims'
import { WORKOS_TEST_CLIENT_ID } from '../../helpers/workosEnv'

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

import { GET } from '@/app/api/auth/workshop/start/route'
import { unseal } from '@/lib/workshop/central-sign-in/seal'
import { workshopWorkOS } from '@/lib/workshop/central-sign-in/workos'

const AUTH = 'auth.example.org'
const TENANT = 'conf.example.org'
const ALLOCATED = 'tenant.konf.run'
/** What the tenant host sends: base64url SHA-256 of its browser value. */
const CHALLENGE = createHash('sha256')
  .update('browser-value')
  .digest('base64url')

const buildAuthorizeUrl = vi.spyOn(
  workshopWorkOS().userManagement,
  'getAuthorizationUrl',
)
const generatePkce = vi.spyOn(workshopWorkOS().pkce, 'generate')

interface Start {
  /** The `Host` header the request arrives with. */
  on?: string
  host?: string | null
  challenge?: string | null
  screen?: string | null
}

function start({
  on = AUTH,
  host = TENANT,
  challenge = CHALLENGE,
  screen = 'sign-in',
}: Start = {}) {
  const url = new URL(`https://${on}/api/auth/workshop/start`)
  if (host !== null) url.searchParams.set('host', host)
  if (challenge !== null) url.searchParams.set('challenge', challenge)
  if (screen !== null) url.searchParams.set('screen', screen)
  return GET(new NextRequest(url, { headers: new Headers({ host: on }) }))
}

async function expectRefused(response: Response) {
  expect(response.status).toBe(404)
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.getSetCookie()).toEqual([])
  expect(buildAuthorizeUrl).not.toHaveBeenCalled()
  expect(generatePkce).not.toHaveBeenCalled()
}

const anything = z.looseObject({})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}`)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getDomainClaim.mockImplementation(
    claimsById(
      provenClaim(TENANT),
      provenClaim(ALLOCATED, { method: 'platform-owned' }),
    ),
  )
  isWorkshopsEnabledForConference.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('start: a proven host', () => {
  it('redirects to WorkOS with the auth host’s callback as redirect_uri', async () => {
    const response = await start()

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(
      'https://api.workos.com/user_management/authorize',
    )
    expect(location.searchParams.get('redirect_uri')).toBe(
      `https://${AUTH}/api/auth/callback`,
    )
    expect(location.searchParams.get('client_id')).toBe(WORKOS_TEST_CLIENT_ID)
    expect(location.searchParams.get('provider')).toBe('authkit')
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('screen_hint')).toBe('sign-in')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('sends a PKCE challenge that is the SHA-256 of the verifier it keeps in its cookie', async () => {
    const response = await start()

    const location = new URL(response.headers.get('location')!)
    const [cookie] = response.headers.getSetCookie()
    const kept = await unseal(
      'auth-start',
      decodeURIComponent(cookie.split(';')[0].split('=')[1]),
      z.object({ codeVerifier: z.string(), nonce: z.string() }),
    )
    expect(kept!.codeVerifier).toMatch(/^[\w-]{43,}$/)
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(kept!.codeVerifier).digest('base64url'),
    )
  })

  it('carries the host, the conference that claims it and the hash in sealed state, tied to the cookie', async () => {
    const response = await start()

    const state = new URL(response.headers.get('location')!).searchParams.get(
      'state',
    )
    const [cookie] = response.headers.getSetCookie()
    const kept = await unseal(
      'auth-start',
      decodeURIComponent(cookie.split(';')[0].split('=')[1]),
      z.object({ nonce: z.string() }),
    )
    expect(await unseal('auth-state', state, anything)).toEqual({
      host: TENANT,
      conferenceId: CLAIMING_CONFERENCE_ID,
      challenge: CHALLENGE,
      nonce: kept!.nonce,
      iat: expect.any(Number),
      exp: expect.any(Number),
    })
    // The verifier never travels in the URL.
    expect(await unseal('auth-start', state, anything)).toBeNull()
  })

  it('sets exactly one cookie: host-only, with the __Host- prefix', async () => {
    const response = await start()

    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(1)
    const [pair, ...attributes] = cookies[0].split('; ')
    expect(pair.split('=')[0]).toBe('__Host-workshop-auth-start')
    expect(attributes.filter((a) => !a.startsWith('Expires='))).toEqual([
      'Path=/',
      'Max-Age=600',
      'Secure',
      'HttpOnly',
      'SameSite=lax',
    ])
  })

  it('asks for the sign-up screen when told to', async () => {
    const response = await start({ screen: 'sign-up' })

    expect(
      new URL(response.headers.get('location')!).searchParams.get(
        'screen_hint',
      ),
    ).toBe('sign-up')
  })

  it('asks the feature gate about the conference that claims the host', async () => {
    await start()

    expect(isWorkshopsEnabledForConference).toHaveBeenCalledWith(
      provenClaim(TENANT).conference,
    )
  })

  it('starts for a host the platform allocated', async () => {
    const response = await start({ host: ALLOCATED })

    expect(response.status).toBe(307)
  })
})

describe('start: refused with 404, and no authorize URL is built', () => {
  it('a host with no record', async () => {
    getDomainClaim.mockImplementation(claimsById())

    await expectRefused(await start())
  })

  it('a grandfathered record inside its grace period', async () => {
    getDomainClaim.mockImplementation(
      claimsById(
        provenClaim(TENANT, {
          method: 'grandfathered',
          graceUntil: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    )

    await expectRefused(await start())
  })

  it('a platform-owned record that is no longer an allocation', async () => {
    expect((await start({ host: ALLOCATED })).status).toBe(307)
    vi.clearAllMocks()
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.app')

    await expectRefused(await start({ host: ALLOCATED }))
  })

  it.each([
    ['a subdomain of a proven host', `sub.${TENANT}`],
    ['a proven host as a prefix', `${TENANT}.evil.net`],
    ['a proven host as a suffix', `evil-${TENANT}`],
    ['the wildcard over a proven host', '*.example.org'],
  ])('%s', async (_, host) => {
    await expectRefused(await start({ host }))
  })

  it('a record whose conference no longer claims the host', async () => {
    getDomainClaim.mockImplementation(
      claimsById(provenClaim(TENANT, {}, { domains: ['other.example.org'] })),
    )

    await expectRefused(await start())
  })

  it('a conference without workshops', async () => {
    isWorkshopsEnabledForConference.mockResolvedValue(false)

    await expectRefused(await start())
  })

  it.each([
    ['userinfo', `attacker@${TENANT}`],
    ['a path', `${TENANT}/workshop`],
    ['a scheme', `https://${TENANT}`],
    ['nothing', null],
  ])('a malformed host: %s, without reading anything', async (_, host) => {
    await expectRefused(await start({ host }))
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('a request that arrives on a host other than the auth host, without reading its record', async () => {
    // The tenant host is itself proven: only where the request arrived differs.
    await expectRefused(await start({ on: TENANT }))
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', null],
    ['too short', CHALLENGE.slice(1)],
    ['not base64url', CHALLENGE.replace(/.$/, '+')],
  ])('a hash that is %s', async (_, challenge) => {
    await expectRefused(await start({ challenge }))
  })

  it.each([
    ['missing', null],
    ['unknown', 'reset-password'],
  ])('a screen that is %s', async (_, screen) => {
    await expectRefused(await start({ screen }))
  })
})

describe('start: WORKSHOP_AUTH_ORIGIN', () => {
  it('unset: a host is its own auth host, and its own callback', async () => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', '')

    const response = await start({ on: TENANT })

    expect(response.status).toBe(307)
    expect(
      new URL(response.headers.get('location')!).searchParams.get(
        'redirect_uri',
      ),
    ).toBe(`https://${TENANT}/api/auth/callback`)
  })

  it.each([
    ['another proven host', ALLOCATED],
    ['a host that is not proven', 'unproven.example.org'],
  ])('unset: a start that names %s is refused', async (_, host) => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', '')

    await expectRefused(await start({ on: TENANT, host }))
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it.each([
    ['plain http outside development', `http://${AUTH}`],
    ['a path', `https://${AUTH}/api/auth`],
    ['not a URL', AUTH],
  ])('refuses every start when it is %s', async (_, value) => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', value)

    await expectRefused(await start())
  })

  it('development: two local origins over plain http, with a cookie a browser will store', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'http://127.0.0.1:3000')
    getConferenceForDomain.mockResolvedValue({
      conference: { _id: 'conference-local', domains: ['localhost:3000'] },
      error: null,
    })

    const response = await start({
      on: '127.0.0.1:3000',
      host: 'localhost:3000',
    })

    expect(
      new URL(response.headers.get('location')!).searchParams.get(
        'redirect_uri',
      ),
    ).toBe('http://127.0.0.1:3000/api/auth/callback')
    const [pair, ...attributes] = response.headers.getSetCookie()[0].split('; ')
    expect(pair.split('=')[0]).toBe('workshop-auth-start')
    expect(attributes.filter((a) => !a.startsWith('Expires='))).toEqual([
      'Path=/',
      'Max-Age=600',
      'HttpOnly',
      'SameSite=lax',
    ])
  })

  it('tolerates a trailing slash', async () => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}/`)

    expect((await start()).status).toBe(307)
  })
})
