/**
 * @vitest-environment node
 *
 * The attendee identity the workshop access guard decides from (#1294) is
 * PROJECTED in `createTRPCContext` from the portal's own session (#1314, spec
 * §6). Router tests inject a ready-made context, so nothing else exercises
 * this projection, or when the session is read at all.
 *
 * REAL: the context, the session read, the destination policy, the seal
 * (`jose`, alias defeated), and every session is one the real routes issued
 * for a complete sign-in.
 * SUPPLIED: the host's record with its conference (`getDomainClaim`), the
 * workshop feature gate, and WorkOS's token endpoint, which only the sign-in
 * itself may call.
 *
 * Every refusal is the session of a genuine sign-in with ONE condition
 * changed.
 */
import '../../__tests__/helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { DomainClaim } from '@/lib/domain-verification/types'
import { claimsById, provenClaim } from '../../__tests__/helpers/domainClaims'

vi.mock('jose', async () =>
  (await import('../../__tests__/helpers/realJose')).realJose(),
)

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }))

const getDomainClaim = vi.fn<(id: string) => Promise<DomainClaim | null>>()
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: (id: string) => getDomainClaim(id),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: vi.fn(),
  getConferenceForCurrentDomain: vi.fn(),
}))

const isWorkshopsEnabledForConference =
  vi.fn<(c: unknown) => Promise<boolean>>()
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: (c: unknown) =>
    isWorkshopsEnabledForConference(c),
}))

import { seal, unseal } from '@/lib/workshop/central-sign-in/seal'
import { workshopWorkOS } from '@/lib/workshop/central-sign-in/workos'
import { handOff, signIn } from '../../__tests__/helpers/workshopFlow'
import { createTRPCContext } from './trpc'

const AUTH = 'auth.example.org'
const HOST = 'conf.example.org'
const OTHER = 'tenant.konf.run'
const SESSION_COOKIE = '__Host-workshop-session'
const WEEK = 7 * 24 * 60 * 60

function request(
  cookie?: string | null,
  init: { host?: string; procedures?: string; headers?: HeadersInit } = {},
) {
  const host = init.host ?? HOST
  const procedures = init.procedures ?? 'workshop.signup'
  const headers = new Headers({ host, ...init.headers })
  if (cookie) headers.set('cookie', cookie)
  return new NextRequest(`https://${host}/api/trpc/${procedures}`, { headers })
}

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

/** Sign in on `host`, then forget what the sign-in itself read and called. */
async function signedIn(host = HOST): Promise<string> {
  const cookie = await signIn(host, AUTH)
  getDomainClaim.mockClear()
  exchangeCode.mockClear()
  return cookie
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}`)
  // The full router graph asserts on its mail configuration at import.
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getDomainClaim.mockImplementation(
    claimsById(
      provenClaim(HOST),
      provenClaim(OTHER, { method: 'platform-owned' }),
    ),
  )
  isWorkshopsEnabledForConference.mockResolvedValue(true)
  exchangeCode.mockResolvedValue(AUTHENTICATED as never)
})

afterEach(() => {
  // A refusal below is a decision, not a crash that happened to answer null.
  expect(console.error).not.toHaveBeenCalled()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('createTRPCContext: the attendee is who signed in', () => {
  it('is the WorkOS user ID, the email and the name from the session', async () => {
    const ctx = await createTRPCContext({ req: request(await signedIn()) })

    expect(ctx.workosUser).toEqual({
      id: 'user_01',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      conferenceId: 'conference-1',
    })
  })

  it('carries an unverified email through as unverified', async () => {
    exchangeCode.mockResolvedValue({
      ...AUTHENTICATED,
      user: { ...AUTHENTICATED.user, emailVerified: false },
    } as never)

    const ctx = await createTRPCContext({ req: request(await signedIn()) })

    expect(ctx.workosUser).toMatchObject({
      id: 'user_01',
      emailVerified: false,
    })
  })

  it('reads the host’s record once and never calls WorkOS', async () => {
    await createTRPCContext({ req: request(await signedIn()) })

    expect(getDomainClaim).toHaveBeenCalledOnce()
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('reads the Host header in any case, as the page does', async () => {
    const ctx = await createTRPCContext({
      req: request(await signedIn(), { host: 'Conf.Example.ORG' }),
    })

    expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
  })

  it('takes the host from the Host header: not x-forwarded-host, not the URL', async () => {
    const cookie = await signedIn()
    const headers = new Headers({
      host: OTHER,
      'x-forwarded-host': HOST,
      cookie,
    })

    const ctx = await createTRPCContext({
      req: new NextRequest(`https://${HOST}/api/trpc/workshop.signup`, {
        headers,
      }),
    })

    expect(ctx.workosUser).toBeNull()
  })
})

describe('createTRPCContext: no attendee', () => {
  it('without the session cookie, without reading a record', async () => {
    await signedIn()

    const ctx = await createTRPCContext({ req: request(null) })

    expect(ctx.workosUser).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('with the cookie under a name without the __Host- prefix, without reading a record', async () => {
    const cookie = await signedIn()

    const ctx = await createTRPCContext({
      req: request(cookie.replace(SESSION_COOKIE, 'workshop-session')),
    })

    expect(ctx.workosUser).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('once 7 days have passed, with the cookie still present', async () => {
    const now = new Date('2026-10-12T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const cookie = await signedIn()

    vi.setSystemTime(now.getTime() + (WEEK - 1) * 1000)
    expect(
      (await createTRPCContext({ req: request(cookie) })).workosUser,
    ).toMatchObject({ id: 'user_01' })

    getDomainClaim.mockClear()
    vi.setSystemTime(now.getTime() + (WEEK + 1) * 1000)
    const ctx = await createTRPCContext({ req: request(cookie) })

    expect(ctx.workosUser).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('with a session copied to another proven host', async () => {
    const cookie = await signedIn(HOST)
    // CONTROL: that host admits a session of its own.
    const own = await signedIn(OTHER)
    expect(
      (await createTRPCContext({ req: request(own, { host: OTHER }) }))
        .workosUser,
    ).toMatchObject({ id: 'user_01' })

    getDomainClaim.mockClear()
    const ctx = await createTRPCContext({
      req: request(cookie, { host: OTHER }),
    })

    expect(ctx.workosUser).toBeNull()
    // Decided from the request alone: that host's record is not read.
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('when the host is now claimed by another conference', async () => {
    const cookie = await signedIn()
    getDomainClaim.mockImplementation(
      claimsById(
        provenClaim(
          HOST,
          { conferenceId: 'conference-2' },
          { _id: 'conference-2' },
        ),
      ),
    )

    const ctx = await createTRPCContext({ req: request(cookie) })

    expect(ctx.workosUser).toBeNull()
  })

  it('when the host no longer passes the destination check', async () => {
    const cookie = await signedIn()
    getDomainClaim.mockImplementation(
      claimsById(provenClaim(HOST, { status: 'failing' })),
    )

    const ctx = await createTRPCContext({ req: request(cookie) })

    expect(ctx.workosUser).toBeNull()
  })

  it('on the auth host, which serves no conference, without reading a record', async () => {
    // Even with a session that names the auth host. No route issues one, but
    // the host is refused from the request alone, whatever the seal says.
    const forAuthHost = await seal(
      'session',
      {
        userId: 'user_01',
        email: 'ada@example.com',
        emailVerified: true,
        name: 'Ada Lovelace',
        sessionId: 'session_01',
        host: AUTH,
        conferenceId: 'conference-1',
      },
      WEEK,
    )
    // Were the auth host a proven tenant host, that session would sign in.
    getDomainClaim.mockImplementation(claimsById(provenClaim(AUTH)))

    const ctx = await createTRPCContext({
      req: request(`${SESSION_COOKIE}=${forAuthHost}`, { host: AUTH }),
    })

    expect(ctx.workosUser).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('with a hand-off token presented as a session, without reading a record', async () => {
    const { token } = await handOff(HOST, AUTH)
    getDomainClaim.mockClear()

    const ctx = await createTRPCContext({
      req: request(`${SESSION_COOKIE}=${token}`),
    })

    expect(ctx.workosUser).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })
})

describe('createTRPCContext: a read never extends the session', () => {
  it('still ends 7 days after sign-in after any number of reads, and no read sets a cookie', async () => {
    const now = new Date('2026-10-12T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'], now })
    const cookie = await signedIn()
    const handler = (await import('@/app/api/trpc/[trpc]/route')).GET

    // Three days of use: the context itself, and the route's HTTP response.
    for (const day of [1, 2, 3]) {
      vi.setSystemTime(now.getTime() + day * 86_400_000)
      const ctx = await createTRPCContext({ req: request(cookie) })
      expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
    }
    const response = await handler(
      request(cookie, { procedures: 'workshop.getMySignups' }),
    )

    expect(response.headers.getSetCookie()).toEqual([])
    // The procedure itself has no conference to answer for here, and says so.
    vi.mocked(console.error).mockClear()
    const sealed = cookie.split('=')[1]
    expect(
      await unseal('session', sealed, z.object({ exp: z.number() })),
    ).toEqual({ exp: now.getTime() / 1000 + WEEK })
    // The session the browser holds is the only one there is: day 8 refuses.
    vi.setSystemTime(now.getTime() + (WEEK + 1) * 1000)
    expect(
      (await createTRPCContext({ req: request(cookie) })).workosUser,
    ).toBeNull()
    // Importing every router takes seconds on a loaded machine.
  }, 30_000)
})

/**
 * The session cookie is host-wide and lasts a week, so it rides on EVERY tRPC
 * request the browser makes on a host where someone once signed in to the
 * portal, an organizer's whole admin session included. Only three procedures
 * consume the attendee identity, so only a request that names one of them may
 * spend a record read on it. The portal's public lists (workshops,
 * announcements) are not among them.
 */
describe('createTRPCContext: only the attendee procedures resolve the attendee', () => {
  it.each([
    ['the attendee’s own signups', 'workshop.getMySignups'],
    ['a signup', 'workshop.signup'],
    ['a cancellation', 'workshop.cancelSignup'],
    ['the portal’s first batch', 'workshop.list,workshop.getMySignups'],
    ['a batch that ends with one', 'conference.getCurrent,workshop.signup'],
    ['a percent-encoded batch', 'conference.getCurrent%2Cworkshop.signup'],
  ])('resolves it for %s', async (_label, procedures) => {
    const ctx = await createTRPCContext({
      req: request(await signedIn(), { procedures }),
    })

    expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
  })

  it.each([
    ['an unrelated procedure', 'sponsor.crm.list'],
    ['an unrelated batch', 'notification.list,conference.getCurrent'],
    ['the workshop list', 'workshop.list'],
    ['the portal’s announcements', 'workshop.announcementsByWorkshop'],
    ['one workshop’s announcements', 'workshop.announcements'],
    [
      'a batch of public workshop reads',
      'workshop.list,workshop.getAvailability',
    ],
    ['the organizer’s workshop procedures', 'workshop.admin.getAllSignups'],
    ['a procedure whose name only starts like one', 'workshop.signupStats'],
    ['a procedure whose name only ends like one', 'admin.workshop.signup'],
    [
      'a router that merely starts with the same letters',
      'workshopping.signup',
    ],
    ['an empty path', ''],
  ])('spends nothing on %s: no record read', async (_label, procedures) => {
    const ctx = await createTRPCContext({
      req: request(await signedIn(), { procedures }),
    })

    expect(ctx.workosUser).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })
})

/**
 * The prefilter above names the attendee procedures one by one. A procedure
 * that starts reading `ctx.workosUser` without being named there would see
 * `null` and refuse every attendee (fail closed, but silently), so the list
 * is held to the source: every reader, and nothing else.
 */
describe('the prefilter’s premise', () => {
  const SRC = join(process.cwd(), 'src')
  const ROUTER = join(SRC, 'server/routers/workshop.ts')
  /** Any mention of the identity, or a call of a helper that reads it. */
  const MENTION =
    /\bworkosUser\b|\brequireWorkshopUser\(|\brequireWorkshopAttendee\(/g

  interface Region {
    name: string
    from: number
    to: number
  }

  /** The source of the workshop router, cut into the regions that matter. */
  function regions(source: string): Region[] {
    const routerAt = source.indexOf('export const workshopRouter = router({')
    // The two helpers: from their declaration to the next closing brace at
    // column zero.
    const helpers = ['requireWorkshopUser', 'requireWorkshopAttendee'].map(
      (name) => {
        const from = source.search(
          new RegExp(`^(async )?function ${name}\\(`, 'm'),
        )
        return { name, from, to: source.indexOf('\n}\n', from) }
      },
    )
    // The router's top-level keys: two spaces of indentation (Prettier's).
    const keys = [...source.slice(routerAt).matchAll(/^ {2}(\w+)[:,]/gm)]
    const procedures = keys.map((key, i) => ({
      name: `workshop.${key[1]}`,
      from: routerAt + key.index,
      to: routerAt + (keys[i + 1]?.index ?? source.length - routerAt),
    }))
    return [...helpers, ...procedures]
  }

  /** Where each mention of the identity in `source` sits. */
  function readers(source: string): string[] {
    const all = regions(source)
    return [...source.matchAll(MENTION)].map(
      (mention) =>
        all.find(
          (region) => region.from <= mention.index && mention.index < region.to,
        )?.name ?? `outside every procedure (offset ${mention.index})`,
    )
  }

  const NAMED = [
    'workshop.cancelSignup',
    'workshop.getMySignups',
    'workshop.signup',
  ]
  const HELPERS = ['requireWorkshopAttendee', 'requireWorkshopUser']

  it('holds: every mention of the attendee in the router is in a named procedure or in a helper only they call', () => {
    const found = [...new Set(readers(readFileSync(ROUTER, 'utf8')))].sort()

    expect(found).toEqual([...HELPERS, ...NAMED].sort())
  })

  it.each([
    [
      'reads it by destructuring',
      (source: string) =>
        source.replace(
          '  list: publicProcedure',
          '  whoAmI: publicProcedure.query(({ ctx }) => {\n    const { workosUser } = ctx\n    return workosUser\n  }),\n\n  list: publicProcedure',
        ),
      'workshop.whoAmI',
    ],
    [
      'is defined above the router and mounted by name',
      (source: string) =>
        source.replace(
          'export const workshopRouter = router({',
          'const whoAmI = publicProcedure.query(({ ctx }) => ctx.workosUser)\n\nexport const workshopRouter = router({\n  whoAmI,',
        ),
      'outside every procedure',
    ],
    [
      'reaches it through a helper of another name',
      (source: string) =>
        source.replace(
          'export const workshopRouter = router({',
          'const who = (ctx: Context) => requireWorkshopUser(ctx)\n\nexport const workshopRouter = router({',
        ),
      'outside every procedure',
    ],
    [
      'calls the gate from a public list',
      (source: string) =>
        source.replace(
          '  announcementsByWorkshop: publicProcedure.query(async () => {',
          '  announcementsByWorkshop: publicProcedure.query(async ({ ctx }) => {\n    await requireWorkshopAttendee(ctx)',
        ),
      'workshop.announcementsByWorkshop',
    ],
  ])(
    'would be caught: a procedure that %s',
    (_label, withAnUnnamedReader, where) => {
      const source = readFileSync(ROUTER, 'utf8')
      const changed = withAnUnnamedReader(source)
      // The edit really landed, and the scan names where.
      expect(changed).not.toBe(source)
      expect(readers(changed).some((name) => name.startsWith(where))).toBe(true)
    },
  )

  it('holds: nothing else in the application mentions the attendee', () => {
    const others = readdirSync(SRC, { recursive: true })
      .map(String)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\./.test(file))
      .filter(
        (file) =>
          !['server/trpc.ts', 'server/routers/workshop.ts'].includes(file),
      )
      .filter((file) =>
        /\bworkosUser\b/.test(readFileSync(join(SRC, file), 'utf8')),
      )

    expect(others).toEqual([])
  })

  it('holds: each of them resolves the attendee, as mounted in the app router', async () => {
    const { appRouter } = await import('./_app')

    for (const procedure of NAMED) {
      expect(Object.keys(appRouter._def.procedures)).toContain(procedure)
      const ctx = await createTRPCContext({
        req: request(await signedIn(), { procedures: procedure }),
      })
      expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
    }
    // Importing every router takes seconds on a loaded machine.
  }, 30_000)
})
