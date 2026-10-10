/**
 * @vitest-environment node
 *
 * `GET /api/auth/callback` on the auth host: where WorkOS sends the code back
 * for a sign-in the auth host started (#1313, spec §3 step 3, §5).
 *
 * REAL: both routes (every flow is STARTED by the real start route, so the
 * state and the cookie are its own), the destination policy, the seal (`jose`,
 * alias defeated) and `@workos-inc/node`.
 * SUPPLIED: the host's record with its conference (`getDomainClaim`), the
 * workshop feature gate, and WorkOS's token endpoint (`authenticateWithCode`),
 * the one network call.
 *
 * Every refusal is a genuine, complete flow with ONE condition changed.
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
import { beginRequest, writtenCookies } from '../../helpers/nextHeadersJar'

vi.mock('jose', async () => (await import('../../helpers/realJose')).realJose())

const getDomainClaim = vi.fn<(id: string) => Promise<DomainClaim | null>>()
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: (id: string) => getDomainClaim(id),
  // The per-host sign-in of today, which a state this flow did not seal falls
  // through to, knows no host here.
  getRedirectUriSyncRow: async () => null,
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: vi.fn(),
  getConferenceForCurrentDomain: vi.fn(),
}))

vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))

const isWorkshopsEnabledForConference =
  vi.fn<(c: unknown) => Promise<boolean>>()
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: (c: unknown) =>
    isWorkshopsEnabledForConference(c),
}))

import { getWorkOS } from '@workos-inc/authkit-nextjs'
import { GET as startRoute } from '@/app/api/auth/workshop/start/route'
import { GET } from '@/app/api/auth/callback/route'
import { seal, unseal } from '@/lib/workshop/central-sign-in/seal'
import { workshopWorkOS } from '@/lib/workshop/central-sign-in/workos'

const AUTH = 'auth.example.org'
const TENANT = 'conf.example.org'
const ALLOCATED = 'tenant.konf.run'
const CHALLENGE = createHash('sha256')
  .update('browser-value')
  .digest('base64url')
const START_COOKIE = '__Host-workshop-auth-start'

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
/** The exchange of today's per-host sign-in: another client, never to be called either. */
const exchangeCodePerHost = vi.spyOn(
  getWorkOS().userManagement,
  'authenticateWithCode',
)

interface Flow {
  state: string
  /** The start cookie as the browser sends it back: `name=value`. */
  cookie: string
}

/** Start a real sign-in for `host` on `on`, as the browser would carry it. */
async function startFlow(host = TENANT, on = AUTH): Promise<Flow> {
  const url = new URL(`https://${on}/api/auth/workshop/start`)
  url.searchParams.set('host', host)
  url.searchParams.set('challenge', CHALLENGE)
  url.searchParams.set('screen', 'sign-in')
  const response = await startRoute(
    new NextRequest(url, { headers: new Headers({ host: on }) }),
  )
  expect(response.status).toBe(307)
  return {
    state: new URL(response.headers.get('location')!).searchParams.get(
      'state',
    )!,
    cookie: response.headers.getSetCookie()[0].split(';')[0],
  }
}

interface Callback {
  on?: string
  code?: string | null
  cookie?: string | null
  /** Extra query parameters, as an attacker or a bug might add them. */
  query?: Record<string, string>
}

/** WorkOS redirecting the browser back with a code. */
function callback(
  flow: Flow,
  {
    on = AUTH,
    code = 'code_from_workos',
    cookie = flow.cookie,
    query,
  }: Callback = {},
) {
  const url = new URL(`https://${on}/api/auth/callback`)
  if (code !== null) url.searchParams.set('code', code)
  url.searchParams.set('state', flow.state)
  for (const [name, value] of Object.entries(query ?? {})) {
    url.searchParams.set(name, value)
  }
  const headers = new Headers({ host: on })
  if (cookie !== null) headers.set('cookie', cookie)
  return GET(new NextRequest(url, { headers }))
}

function expectRefused(response: Response) {
  expect(response.status).toBe(404)
  expect(response.headers.get('location')).toBeNull()
  expect(exchangeCode).not.toHaveBeenCalled()
  expect(exchangeCodePerHost).not.toHaveBeenCalled()
}

const anything = z.looseObject({})

function handoffToken(response: Response): string {
  return new URL(response.headers.get('location')!).searchParams.get('token')!
}

beforeEach(() => {
  vi.clearAllMocks()
  beginRequest()
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
  exchangeCode.mockResolvedValue(AUTHENTICATED as never)
  exchangeCodePerHost.mockResolvedValue(AUTHENTICATED as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('callback: a sign-in the auth host started', () => {
  it('exchanges the code once, with the verifier the start cookie holds', async () => {
    const flow = await startFlow()
    const kept = await unseal(
      'auth-start',
      decodeURIComponent(flow.cookie.split('=')[1]),
      z.object({ codeVerifier: z.string() }),
    )

    await callback(flow)

    expect(exchangeCode).toHaveBeenCalledOnce()
    expect(exchangeCode).toHaveBeenCalledWith({
      code: 'code_from_workos',
      codeVerifier: kept!.codeVerifier,
    })
  })

  it('redirects to the redeem route on exactly the host from state, with the token and nothing else', async () => {
    const response = await callback(await startFlow())

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(
      `https://${TENANT}/workshop/redeem`,
    )
    expect([...location.searchParams.keys()]).toEqual(['token'])
    expect(location.hash).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('sets no session: the only cookie on the response clears the start cookie', async () => {
    const response = await callback(await startFlow())

    expect(response.headers.getSetCookie()).toEqual([
      `${START_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax`,
    ])
    // Nor through the request's cookie store, where the SDK's handler writes.
    expect(writtenCookies()).toEqual([])
  })

  it('hands off who signed in, for which host and conference, bound to the tenant’s hash', async () => {
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-10-10T12:00:00Z'),
    })
    const token = handoffToken(await callback(await startFlow()))

    expect(await unseal('session', token, anything)).toBeNull()
    expect(await unseal('handoff', token, anything)).toEqual({
      userId: 'user_01',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      sessionId: 'session_01',
      host: TENANT,
      conferenceId: CLAIMING_CONFERENCE_ID,
      challenge: CHALLENGE,
      iat: Date.parse('2026-10-10T12:00:00Z') / 1000,
      exp: Date.parse('2026-10-10T12:01:00Z') / 1000,
    })
  })

  it('hands off a token that lasts 60 seconds', async () => {
    const now = new Date('2026-10-10T12:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const token = handoffToken(await callback(await startFlow()))

    vi.setSystemTime(now.getTime() + 59_000)
    expect(await unseal('handoff', token, anything)).not.toBeNull()
    vi.setSystemTime(now.getTime() + 61_000)
    expect(await unseal('handoff', token, anything)).toBeNull()
  })

  it('hands off an unverified email as unverified, and no name as null', async () => {
    exchangeCode.mockResolvedValue({
      ...AUTHENTICATED,
      user: {
        ...AUTHENTICATED.user,
        emailVerified: false,
        firstName: null,
        lastName: null,
      },
    } as never)

    const token = handoffToken(await callback(await startFlow()))

    expect(await unseal('handoff', token, anything)).toMatchObject({
      emailVerified: false,
      name: null,
    })
  })

  it('takes the host and the hash from sealed state only, whatever the query string names', async () => {
    const response = await callback(await startFlow(), {
      query: {
        host: ALLOCATED,
        challenge: 'x'.repeat(43),
        conferenceId: 'conference-2',
        returnTo: `https://${ALLOCATED}/`,
      },
    })

    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(
      `https://${TENANT}/workshop/redeem`,
    )
    expect(
      await unseal('handoff', handoffToken(response), anything),
    ).toMatchObject({
      host: TENANT,
      conferenceId: CLAIMING_CONFERENCE_ID,
      challenge: CHALLENGE,
    })
  })

  it('keeps two hosts apart: each flow hands off to its own host', async () => {
    const response = await callback(await startFlow(ALLOCATED))

    expect(new URL(response.headers.get('location')!).origin).toBe(
      `https://${ALLOCATED}`,
    )
  })
})

describe('callback: refused with 404, and the code is never exchanged', () => {
  it('without the cookie the start route set', async () => {
    expectRefused(await callback(await startFlow(), { cookie: null }))
  })

  it('with the cookie of another started sign-in', async () => {
    const first = await startFlow()
    const second = await startFlow()

    expectRefused(await callback(first, { cookie: second.cookie }))
  })

  it('with the state itself in place of the cookie', async () => {
    const flow = await startFlow()

    expectRefused(
      await callback(flow, { cookie: `${START_COOKIE}=${flow.state}` }),
    )
  })

  it('with the cookie under a name without the __Host- prefix', async () => {
    const flow = await startFlow()

    expectRefused(
      await callback(flow, {
        cookie: flow.cookie.replace(START_COOKIE, 'workshop-auth-start'),
      }),
    )
  })

  it('without a code', async () => {
    expectRefused(await callback(await startFlow(), { code: null }))
  })

  it('a host delisted between start and callback', async () => {
    const flow = await startFlow()
    getDomainClaim.mockImplementation(
      claimsById(provenClaim(TENANT, { status: 'failing' })),
    )

    expectRefused(await callback(flow))
  })

  it('a host that another conference has claimed since the start', async () => {
    const flow = await startFlow()
    getDomainClaim.mockImplementation(
      claimsById(
        provenClaim(
          TENANT,
          { conferenceId: 'conference-2' },
          { _id: 'conference-2' },
        ),
      ),
    )

    expectRefused(await callback(flow))
  })

  it('a conference whose workshops were switched off since the start', async () => {
    const flow = await startFlow()
    isWorkshopsEnabledForConference.mockResolvedValue(false)

    expectRefused(await callback(flow))
  })

  it('a callback that arrives on a host other than the auth host, without reading a record', async () => {
    const flow = await startFlow()
    getDomainClaim.mockClear()

    expectRefused(await callback(flow, { on: TENANT }))
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('a state older than ten minutes', async () => {
    const now = new Date('2026-10-10T12:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const flow = await startFlow()

    vi.setSystemTime(now.getTime() + 599_000)
    expect((await callback(flow)).status).toBe(307)
    exchangeCode.mockClear()
    vi.setSystemTime(now.getTime() + 601_000)
    expectRefused(await callback(flow))
  })

  it('a state sealed for another purpose', async () => {
    const flow = await startFlow()
    const forged = await seal(
      'handoff',
      (await unseal('auth-state', flow.state, anything))!,
      600,
    )

    expectRefused(await callback({ ...flow, state: forged }))
  })
})

describe('callback: WorkOS does not answer as expected', () => {
  it('answers 404 with no hand-off when the exchange fails', async () => {
    exchangeCode.mockRejectedValue(new Error('invalid_grant'))

    const response = await callback(await startFlow())

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
  })

  it('answers 404 with no hand-off when the access token names no session', async () => {
    exchangeCode.mockResolvedValue({
      ...AUTHENTICATED,
      accessToken: accessToken({ sub: 'user_01' }),
    } as never)

    const response = await callback(await startFlow())

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
  })
})

describe('callback: WORKSHOP_AUTH_ORIGIN unset', () => {
  beforeEach(() => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', '')
  })

  it('a host finishes its own sign-in and hands off to itself', async () => {
    const flow = await startFlow(TENANT, TENANT)

    const response = await callback(flow, { on: TENANT })

    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(
      `https://${TENANT}/workshop/redeem`,
    )
    expect(exchangeCode).toHaveBeenCalledOnce()
  })

  it('a callback on any other host than the one in state is refused', async () => {
    const flow = await startFlow(TENANT, TENANT)

    expectRefused(await callback(flow, { on: ALLOCATED }))
  })
})
