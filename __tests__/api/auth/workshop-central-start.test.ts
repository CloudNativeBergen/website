/**
 * @vitest-environment node
 *
 * `GET /api/auth/workshop/start`: the auth host starts a workshop sign-in for
 * a tenant host (#1313, spec §3 step 2), on that host's sealed request (#1314).
 *
 * REAL: the route, the destination policy, the seal (`jose`, alias defeated)
 * and `@workos-inc/node`, which builds the authorize URL and the PKCE pair.
 * SUPPLIED: the host's record with its conference (`getDomainClaim`) and the
 * workshop feature gate.
 *
 * Every refusal is `start()` with ONE condition changed. `start()` seals the
 * request as a tenant host would, so the auth host's own checks of what is
 * inside it can be reached.
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
import { seal, unseal } from '@/lib/workshop/central-sign-in/seal'
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
  /** The `request` parameter as sent, in place of one sealed from the above. */
  request?: string | null
  /** Clear query parameters, as the route took them before it wanted a seal. */
  query?: Record<string, string>
}

/** What a tenant host seals: these fields, valid for a minute. */
function sealedRequest(fields: Record<string, string | null>) {
  return seal(
    'start-request',
    Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== null),
    ),
    60,
  )
}

async function start({
  on = AUTH,
  host = TENANT,
  challenge = CHALLENGE,
  screen = 'sign-in',
  request,
  query,
}: Start = {}) {
  const url = new URL(`https://${on}/api/auth/workshop/start`)
  const sealed =
    request === undefined
      ? await sealedRequest({ host, challenge, screen })
      : request
  if (sealed !== null) url.searchParams.set('request', sealed)
  for (const [name, value] of Object.entries(query ?? {})) {
    url.searchParams.set(name, value)
  }
  return GET(new NextRequest(url, { headers: new Headers({ host: on }) }))
}

function expectNothingStarted(response: Response) {
  expect(response.status).toBe(404)
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.getSetCookie()).toEqual([])
  expect(buildAuthorizeUrl).not.toHaveBeenCalled()
  expect(generatePkce).not.toHaveBeenCalled()
}

/** Refused, for exactly this reason: the one line the log gets. */
function expectRefused(
  response: Response,
  reason: 'no-request' | 'host-refused',
) {
  expectNothingStarted(response)
  expect(console.warn).toHaveBeenCalledExactlyOnceWith(
    `[workshop] start refused: ${reason}`,
  )
  // A decision, not a crash that happened to answer the same.
  expect(console.error).not.toHaveBeenCalled()
}

const anything = z.looseObject({})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
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
})

afterEach(() => {
  vi.useRealTimers()
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
    // WorkOS is not told which tenant host the browser came from.
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(console.warn).not.toHaveBeenCalled()
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
    const now = Date.parse('2026-10-10T12:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const response = await start()

    const state = new URL(response.headers.get('location')!).searchParams.get(
      'state',
    )
    const [cookie] = response.headers.getSetCookie()
    const kept = await unseal(
      'auth-start',
      decodeURIComponent(cookie.split(';')[0].split('=')[1]),
      z.object({ nonce: z.string(), iat: z.number(), exp: z.number() }),
    )
    // Each seal lasts ten minutes, on its own.
    expect([kept!.iat, kept!.exp]).toEqual([now / 1000, now / 1000 + 600])
    expect(await unseal('auth-state', state, anything)).toEqual({
      host: TENANT,
      conferenceId: CLAIMING_CONFERENCE_ID,
      challenge: CHALLENGE,
      nonce: kept!.nonce,
      iat: now / 1000,
      exp: now / 1000 + 600,
    })
    // The verifier never travels in the URL.
    expect(await unseal('auth-start', state, anything)).toBeNull()
  })

  it('takes the host, the hash and the screen from the sealed request only, whatever the query string names', async () => {
    const response = await start({
      query: {
        host: ALLOCATED,
        challenge: 'x'.repeat(43),
        screen: 'sign-up',
      },
    })

    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('screen_hint')).toBe('sign-in')
    expect(
      await unseal('auth-state', location.searchParams.get('state'), anything),
    ).toMatchObject({
      host: TENANT,
      conferenceId: CLAIMING_CONFERENCE_ID,
      challenge: CHALLENGE,
    })
    expect(getDomainClaim.mock.calls).toEqual([
      [`domainVerification.${TENANT}`],
    ])
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

    await expectRefused(await start(), 'host-refused')
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

    await expectRefused(await start(), 'host-refused')
  })

  it('a platform-owned record that is no longer an allocation', async () => {
    expect((await start({ host: ALLOCATED })).status).toBe(307)
    vi.clearAllMocks()
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.app')

    await expectRefused(await start({ host: ALLOCATED }), 'host-refused')
  })

  it.each([
    ['a subdomain of a proven host', `sub.${TENANT}`],
    ['a proven host as a prefix', `${TENANT}.evil.net`],
    ['a proven host as a suffix', `evil-${TENANT}`],
  ])('%s', async (_, host) => {
    await expectRefused(await start({ host }), 'host-refused')
  })

  it('the wildcard over a proven host, without reading a record', async () => {
    // A record under the wildcard's own id would otherwise be found.
    getDomainClaim.mockImplementation(
      claimsById(provenClaim(TENANT), {
        ...provenClaim('*.example.org'),
        record: {
          ...provenClaim('*.example.org').record,
          _id: 'domainVerification.wildcard.example.org',
        },
      }),
    )

    await expectRefused(await start({ host: '*.example.org' }), 'host-refused')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('a record whose conference no longer claims the host', async () => {
    getDomainClaim.mockImplementation(
      claimsById(provenClaim(TENANT, {}, { domains: ['other.example.org'] })),
    )

    await expectRefused(await start(), 'host-refused')
  })

  it('a conference without workshops', async () => {
    isWorkshopsEnabledForConference.mockResolvedValue(false)

    await expectRefused(await start(), 'host-refused')
  })

  it.each([
    ['userinfo', `attacker@${TENANT}`, 'host-refused'],
    ['a path', `${TENANT}/workshop`, 'host-refused'],
    ['a scheme', `https://${TENANT}`, 'host-refused'],
    // A request that names no host is not one a tenant host seals.
    ['nothing', null, 'no-request'],
  ] as const)(
    'a malformed host: %s, without reading anything',
    async (_, host, reason) => {
      await expectRefused(await start({ host }), reason)
      expect(getDomainClaim).not.toHaveBeenCalled()
    },
  )

  it('a request that arrives on a host other than the auth host, without reading its record', async () => {
    // The tenant host is itself proven: only where the request arrived differs.
    await expectRefused(await start({ on: TENANT }), 'host-refused')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it.each([
    ['a subdomain of the auth host', `sub.${AUTH}`],
    ['a host that ends with the auth host', `evil-${AUTH}`],
    ['a host that starts with the auth host', `${AUTH}.evil.net`],
  ])(
    'a request that arrives on %s, without reading a record',
    async (_, on) => {
      await expectRefused(await start({ on }), 'host-refused')
      expect(getDomainClaim).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['missing', null],
    ['too short', CHALLENGE.slice(1)],
    ['not base64url', CHALLENGE.replace(/.$/, '+')],
  ])('a hash that is %s', async (_, challenge) => {
    await expectRefused(await start({ challenge }), 'no-request')
  })

  it.each([
    ['missing', null],
    ['unknown', 'reset-password'],
  ])('a screen that is %s', async (_, screen) => {
    await expectRefused(await start({ screen }), 'no-request')
  })
})

describe('start: only on a request a tenant host sealed', () => {
  it('no request at all: refused, without reading a record', async () => {
    await expectRefused(await start({ request: null }), 'no-request')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('the host, the hash and the screen as clear parameters: refused, without reading a record', async () => {
    await expectRefused(
      await start({
        request: null,
        query: { host: TENANT, challenge: CHALLENGE, screen: 'sign-in' },
      }),
      'no-request',
    )
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('a request sealed for another purpose: refused, without reading a record', async () => {
    const asState = await seal(
      'auth-state',
      { host: TENANT, challenge: CHALLENGE, screen: 'sign-in' },
      60,
    )

    await expectRefused(await start({ request: asState }), 'no-request')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('a request that was changed on the way: refused', async () => {
    const sealed = await sealedRequest({
      host: TENANT,
      challenge: CHALLENGE,
      screen: 'sign-in',
    })
    // One character of the ciphertext, the fourth of a compact JWE's five parts.
    const parts = sealed.split('.')
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1)
    const changed = parts.join('.')

    await expectRefused(await start({ request: changed }), 'no-request')
  })

  it('a request is good for 60 seconds and no longer', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00Z') })
    const sealed = await sealedRequest({
      host: TENANT,
      challenge: CHALLENGE,
      screen: 'sign-in',
    })

    vi.setSystemTime(new Date('2026-10-12T10:00:59Z'))
    expect((await start({ request: sealed })).status).toBe(307)

    vi.clearAllMocks()
    vi.setSystemTime(new Date('2026-10-12T10:01:01Z'))
    await expectRefused(await start({ request: sealed }), 'no-request')
    expect(getDomainClaim).not.toHaveBeenCalled()
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

    await expectRefused(await start({ on: TENANT, host }), 'host-refused')
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it.each([
    ['plain http outside development', `http://${AUTH}`],
    ['a path', `https://${AUTH}/api/auth`],
    ['not a URL', AUTH],
    ['a host with a trailing dot', `https://${AUTH}.`],
    ['an IPv6 literal', 'https://[::1]:3000'],
  ])('refuses every start, and says so, when it is %s', async (_, value) => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', value)

    expectNothingStarted(await start())
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('WORKSHOP_AUTH_ORIGIN'),
    )
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
