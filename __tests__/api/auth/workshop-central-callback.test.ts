/**
 * @vitest-environment node
 *
 * `GET /api/auth/callback` on the auth host: where WorkOS sends the code back
 * for a sign-in the auth host started (#1313, spec §3 step 3, §5).
 *
 * REAL: all three routes (every flow is BEGUN on the tenant host and STARTED
 * by the real start route, so the state and the cookies are their own), the
 * destination policy, the seal (`jose`, alias defeated) and `@workos-inc/node`.
 * SUPPLIED: the host's record with its conference (`getDomainClaim`), the
 * workshop feature gate, and WorkOS's token endpoint (`authenticateWithCode`),
 * the one network call.
 *
 * Every refusal is a genuine, complete flow with ONE condition changed.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GenericServerException } from '@workos-inc/node'
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

import { seal, unseal } from '@/lib/workshop/central-sign-in/seal'
import {
  callback as callbackOn,
  startFlow as startFlowOn,
  type CallbackOptions,
  type StartedFlow,
} from '../../helpers/workshopFlow'
import { workshopWorkOS } from '@/lib/workshop/central-sign-in/workos'

const AUTH = 'auth.example.org'
const TENANT = 'conf.example.org'
const ALLOCATED = 'tenant.konf.run'
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

/** A sign-in begun on `host` and started on the auth host `on`. */
const startFlow = (host = TENANT, on = AUTH) => startFlowOn(host, on)

/** WorkOS redirecting the browser back with a code. */
const callback = (
  flow: Pick<StartedFlow, 'state' | 'cookie'>,
  options: Partial<CallbackOptions> = {},
) => callbackOn(flow, { on: AUTH, ...options })

/** What a 404 on the auth host says: nothing tells it where to send anyone. */
const NOT_COMPLETED =
  'This sign-in could not be completed. Go back to the conference website and sign in again.'

/** Refused, for exactly this reason: the one line the log gets. */
async function expectRefused(response: Response, reason: string) {
  expect(console.warn).toHaveBeenCalledExactlyOnceWith(
    `[workshop] callback refused: ${reason}`,
  )
  expect(response.status).toBe(404)
  expect(await response.text()).toBe(NOT_COMPLETED)
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.getSetCookie()).toEqual([])
  expect(exchangeCode).not.toHaveBeenCalled()
  // A decision, not a crash that happened to answer the same.
  expect(console.error).not.toHaveBeenCalled()
}

/**
 * Refused for this reason, and sent back to the portal of the host the sign-in
 * began on, to say it did not complete. Nothing is exchanged and no cookie set.
 */
function expectIncomplete(response: Response, reason: string, host = TENANT) {
  expect(console.warn).toHaveBeenCalledExactlyOnceWith(
    `[workshop] callback refused: ${reason}`,
  )
  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toBe(
    `https://${host}/workshop?sign-in=incomplete`,
  )
  expect(response.headers.getSetCookie()).toEqual([])
  expect(response.headers.get('cache-control')).toBe('no-store')
  // The callback URL carries the state: the tenant host is not sent it.
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  expect(exchangeCode).not.toHaveBeenCalled()
  expect(console.error).not.toHaveBeenCalled()
}

/** What WorkOS sends back when the attendee cancels: an error, no code. */
const WORKOS_ERROR = {
  code: null,
  query: { error: 'access_denied', error_description: 'The user cancelled.' },
}

const anything = z.looseObject({})

function handoffToken(response: Response): string {
  return new URL(response.headers.get('location')!).searchParams.get('token')!
}

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
  exchangeCode.mockResolvedValue(AUTHENTICATED as never)
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
  })

  it('hands off who signed in, for which host and conference, bound to the tenant’s hash', async () => {
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-10-10T12:00:00Z'),
    })
    const flow = await startFlow()
    const token = handoffToken(await callback(flow))

    expect(await unseal('session', token, anything)).toBeNull()
    expect(await unseal('handoff', token, anything)).toEqual({
      userId: 'user_01',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      sessionId: 'session_01',
      host: TENANT,
      conferenceId: CLAIMING_CONFERENCE_ID,
      challenge: flow.challenge,
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
    const flow = await startFlow()
    const response = await callback(flow, {
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
      challenge: flow.challenge,
    })
  })

  it('keeps two hosts apart: each flow hands off to its own host', async () => {
    const response = await callback(await startFlow(ALLOCATED))

    expect(new URL(response.headers.get('location')!).origin).toBe(
      `https://${ALLOCATED}`,
    )
  })
})

describe('callback: refused, and sent back to the host the sign-in began on', () => {
  it('when WorkOS reports an error instead of a code, without reading a record', async () => {
    const flow = await startFlow()
    getDomainClaim.mockClear()
    isWorkshopsEnabledForConference.mockClear()

    expectIncomplete(await callback(flow, WORKOS_ERROR), 'no-code')
    expect(getDomainClaim).not.toHaveBeenCalled()
    expect(isWorkshopsEnabledForConference).not.toHaveBeenCalled()
  })

  it('without the cookie the start route set (Back and submit again), without reading a record', async () => {
    const flow = await startFlow()
    getDomainClaim.mockClear()
    isWorkshopsEnabledForConference.mockClear()

    expectIncomplete(await callback(flow, { cookie: null }), 'no-cookie')
    expect(getDomainClaim).not.toHaveBeenCalled()
    expect(isWorkshopsEnabledForConference).not.toHaveBeenCalled()
  })

  it('with the cookie of another started sign-in, without reading a record', async () => {
    const first = await startFlow()
    const second = await startFlow()
    getDomainClaim.mockClear()

    expectIncomplete(
      await callback(first, { cookie: second.cookie }),
      'no-cookie',
    )
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('with the cookie under a name without the __Host- prefix', async () => {
    const flow = await startFlow()

    expectIncomplete(
      await callback(flow, {
        cookie: flow.cookie.replace(START_COOKIE, 'workshop-auth-start'),
      }),
      'no-cookie',
    )
  })

  it('to the host in sealed state only, whatever the query string names', async () => {
    const flow = await startFlow()

    expectIncomplete(
      await callback(flow, {
        cookie: null,
        query: {
          host: ALLOCATED,
          returnTo: `https://${ALLOCATED}/`,
          redirect_uri: `https://${ALLOCATED}/workshop`,
        },
      }),
      'no-cookie',
    )
  })

  it('keeps two hosts apart: each goes back to its own host', async () => {
    const flow = await startFlow(ALLOCATED)

    expectIncomplete(await callback(flow, WORKOS_ERROR), 'no-code', ALLOCATED)
  })
})

describe('callback: refused with 404, and the code is never exchanged', () => {
  it('a host delisted between start and callback', async () => {
    const flow = await startFlow()
    getDomainClaim.mockImplementation(
      claimsById(provenClaim(TENANT, { status: 'failing' })),
    )

    await expectRefused(await callback(flow), 'host-refused')
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

    await expectRefused(await callback(flow), 'conference-changed')
  })

  it('a conference whose workshops were switched off since the start', async () => {
    const flow = await startFlow()
    isWorkshopsEnabledForConference.mockResolvedValue(false)

    await expectRefused(await callback(flow), 'host-refused')
  })

  it.each([
    ['with a code', {}],
    ['with an error from WorkOS', WORKOS_ERROR],
    ['without its cookie', { cookie: null }],
  ])(
    'a callback that arrives on a host other than the auth host, %s, without reading a record',
    async (_, options) => {
      const flow = await startFlow()
      getDomainClaim.mockClear()

      await expectRefused(
        await callback(flow, { on: TENANT, ...options }),
        'host-refused',
      )
      expect(getDomainClaim).not.toHaveBeenCalled()
    },
  )

  it('a state older than thirty minutes', async () => {
    const now = new Date('2026-10-10T12:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const flow = await startFlow()

    vi.setSystemTime(now.getTime() + 1_799_000)
    expect((await callback(flow)).status).toBe(307)
    exchangeCode.mockClear()
    expect(console.warn).not.toHaveBeenCalled()
    vi.setSystemTime(now.getTime() + 1_801_000)
    await expectRefused(await callback(flow), 'no-state')
  })

  it.each([
    ['no state', null],
    ['a state that is not a seal', 'not-a-seal'],
    [
      'a state of the per-host sign-in this replaces',
      'Fe26.2*1*abc*def*ghi*jkl**mno*pqr~',
    ],
  ])('%s, without reading a record', async (_, state) => {
    const flow = await startFlow()
    getDomainClaim.mockClear()

    await expectRefused(
      await callback({ ...flow, state: state as string }),
      'no-state',
    )
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('a state sealed for another purpose', async () => {
    const flow = await startFlow()
    const forged = await seal(
      'handoff',
      (await unseal('auth-state', flow.state, anything))!,
      600,
    )

    await expectRefused(await callback({ ...flow, state: forged }), 'no-state')
  })
})

/** Sent back to the tenant host's portal to say the sign-in did not complete. */
function expectBackToPortal(response: Response) {
  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toBe(
    `https://${TENANT}/workshop?sign-in=incomplete`,
  )
  expect(response.headers.getSetCookie()).toEqual([])
}

describe('callback: WorkOS does not answer as expected', () => {
  it('sends the browser back with no hand-off when the exchange fails, and logs what failed', async () => {
    exchangeCode.mockRejectedValue(new TypeError('fetch failed'))

    const response = await callback(await startFlow())

    expectBackToPortal(response)
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[workshop] the code exchange failed; nothing handed off',
      { name: 'TypeError', message: 'fetch failed' },
    )
  })

  it('logs WorkOS’s refusal by its codes, never its message or its body', async () => {
    // The SDK's own exception, as it builds one from WorkOS's answer.
    exchangeCode.mockRejectedValue(
      new GenericServerException(
        403,
        'Email ownership must be verified: ada@example.com',
        {
          code: 'email_verification_required',
          email: 'ada@example.com',
          pending_authentication_token: 'pending_token_value',
        },
        'req_01',
      ),
    )

    const response = await callback(await startFlow())

    expectBackToPortal(response)
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[workshop] the code exchange failed; nothing handed off',
      {
        name: 'GenericServerException',
        code: 'email_verification_required',
        error: undefined,
        status: 403,
        requestID: 'req_01',
      },
    )
  })

  it('sends the browser back with no hand-off when the access token names no session', async () => {
    exchangeCode.mockResolvedValue({
      ...AUTHENTICATED,
      accessToken: accessToken({ sub: 'user_01' }),
    } as never)

    expectBackToPortal(await callback(await startFlow()))
  })
})

describe('callback: development, two local origins over plain http', () => {
  it('hands off from 127.0.0.1 to localhost', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'http://127.0.0.1:3000')
    getConferenceForDomain.mockResolvedValue({
      conference: { _id: 'conference-local', domains: ['localhost:3000'] },
      error: null,
    })
    const flow = await startFlow('localhost:3000', '127.0.0.1:3000')

    const response = await callback(flow, { on: '127.0.0.1:3000' })

    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(
      'http://localhost:3000/workshop/redeem',
    )
    expect(response.headers.getSetCookie()).toEqual([
      'workshop-auth-start=; Path=/; Max-Age=0; HttpOnly; SameSite=lax',
    ])
  })

  it('sends a refused return back to localhost over http', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'http://127.0.0.1:3000')
    getConferenceForDomain.mockResolvedValue({
      conference: { _id: 'conference-local', domains: ['localhost:3000'] },
      error: null,
    })
    const flow = await startFlow('localhost:3000', '127.0.0.1:3000')

    const response = await callback(flow, { on: '127.0.0.1:3000', code: null })

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/workshop?sign-in=incomplete',
    )
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

  it('a refused return goes back to the host itself', async () => {
    const flow = await startFlow(TENANT, TENANT)

    expectIncomplete(
      await callback(flow, { on: TENANT, cookie: null }),
      'no-cookie',
    )
  })

  it('a callback on any other host than the one in state is refused', async () => {
    const flow = await startFlow(TENANT, TENANT)

    await expectRefused(await callback(flow, { on: ALLOCATED }), 'host-refused')
  })
})
