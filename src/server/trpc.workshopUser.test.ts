/**
 * @vitest-environment node
 *
 * The attendee identity the workshop access guard decides from (#1294) is
 * PROJECTED from the WorkOS session in `createTRPCContext`. Router tests inject
 * a ready-made context, so nothing else exercises this projection — and a wrong
 * or dropped `emailVerified` here refuses every attendee at the API while the
 * page (which reads the session itself) still admits them.
 *
 * AuthKit is mocked: this pins OUR projection of a session, not the library's
 * session shape. That `user.emailVerified` exists on the SDK's `User` is held
 * by the type checker.
 *
 * It also pins WHEN the session is read at all (#1296): only for a request that
 * names a `workshop.*` procedure, only on a host whose live sign-in standing
 * is ready, and with that host's own callback as `redirectUri` — the
 * same decision the proxy takes for the page, so the API cannot be more
 * permissive than the page. The by-id Sanity boundary for the sign-in standing
 * is supplied; the real decision runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import type { RedirectUriSyncRow } from '@/lib/domain-verification/types'
import {
  signInHost,
  signInHostsById,
} from '../../__tests__/helpers/workshopSignIn'

const h = vi.hoisted(() => ({ authkit: vi.fn() }))

const getRedirectUriSyncRow =
  vi.fn<(id: string) => Promise<RedirectUriSyncRow | null>>()

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }))
vi.mock('@workos-inc/authkit-nextjs', () => ({ authkit: h.authkit }))
vi.mock('@/lib/domain-verification/sanity', () => ({
  getRedirectUriSyncRow: (id: string) => getRedirectUriSyncRow(id),
}))

import { createTRPCContext } from './trpc'

const HOST = 'conf.example.org'

function request(
  cookie?: string,
  init: { host?: string; procedures?: string } = {},
) {
  const host = init.host ?? HOST
  const procedures = init.procedures ?? 'workshop.signup'
  return new NextRequest(`https://${host}/api/trpc/${procedures}`, {
    headers: new Headers({ host, ...(cookie ? { cookie } : {}) }),
  })
}

const WORKOS_USER = {
  id: 'user_01',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
}

beforeEach(() => {
  vi.clearAllMocks()
  getRedirectUriSyncRow.mockImplementation(signInHostsById([signInHost(HOST)]))
  h.authkit.mockResolvedValue({
    session: { user: { ...WORKOS_USER, emailVerified: true } },
  })
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('createTRPCContext — WorkOS attendee identity', () => {
  it('carries a verified email through as verified', async () => {
    h.authkit.mockResolvedValue({
      session: { user: { ...WORKOS_USER, emailVerified: true } },
    })

    const ctx = await createTRPCContext({ req: request('wos-session=sealed') })

    expect(ctx.workosUser).toEqual({ ...WORKOS_USER, emailVerified: true })
  })

  it.each([
    ['false', { emailVerified: false }],
    ['absent', {}],
    ['a truthy non-boolean', { emailVerified: 'true' }],
  ])('treats %s as NOT verified', async (_label, verification) => {
    h.authkit.mockResolvedValue({
      session: { user: { ...WORKOS_USER, ...verification } },
    })

    const ctx = await createTRPCContext({ req: request('wos-session=sealed') })

    expect(ctx.workosUser).toMatchObject({
      id: 'user_01',
      emailVerified: false,
    })
  })

  it('resolves no attendee, and never calls AuthKit, without the session cookie', async () => {
    const ctx = await createTRPCContext({ req: request() })

    expect(ctx.workosUser).toBeNull()
    expect(h.authkit).not.toHaveBeenCalled()
    // Nor is the sign-in standing read: NextAuth-only traffic costs nothing here.
    expect(getRedirectUriSyncRow).not.toHaveBeenCalled()
  })
})

/**
 * The page and the API must take the SAME host decision (#1296). The proxy
 * refuses `/workshop/sign-in` on a host that cannot sign in; a session cookie
 * presented to the API on such a host is not read either.
 */
describe('createTRPCContext — the WorkOS session follows the verified host', () => {
  it('reads the session with THIS host’s callback as redirectUri', async () => {
    const req = request('wos-session=sealed')
    const ctx = await createTRPCContext({ req })

    expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
    expect(h.authkit).toHaveBeenCalledOnce()
    expect(h.authkit).toHaveBeenCalledWith(req, {
      redirectUri: `https://${HOST}/api/auth/callback`,
    })
  })

  it('resolves no attendee on a host that cannot sign in, and never enters AuthKit', async () => {
    const ctx = await createTRPCContext({
      req: request('wos-session=sealed', { host: 'unverified.example.org' }),
    })

    expect(ctx.workosUser).toBeNull()
    expect(h.authkit).not.toHaveBeenCalled()
  })

  it('takes the host from the Host header — not x-forwarded-host, not the URL', async () => {
    const hostile = new NextRequest(
      `https://${HOST}/api/trpc/workshop.signup`,
      {
        headers: new Headers({
          host: 'unverified.example.org',
          'x-forwarded-host': HOST,
          cookie: 'wos-session=sealed',
        }),
      },
    )
    const honest = new NextRequest(
      'https://unverified.example.org/api/trpc/workshop.signup',
      {
        headers: new Headers({
          host: HOST,
          'x-forwarded-host': 'unverified.example.org',
          cookie: 'wos-session=sealed',
        }),
      },
    )

    expect((await createTRPCContext({ req: hostile })).workosUser).toBeNull()
    expect(h.authkit).not.toHaveBeenCalled()

    expect((await createTRPCContext({ req: honest })).workosUser).toMatchObject(
      { id: 'user_01' },
    )
    expect(h.authkit).toHaveBeenCalledWith(honest, {
      redirectUri: `https://${HOST}/api/auth/callback`,
    })
  })

  it('decides from the sign-in standing BEFORE AuthKit is called', async () => {
    await createTRPCContext({ req: request('wos-session=sealed') })

    expect(getRedirectUriSyncRow).toHaveBeenCalledOnce()
    expect(getRedirectUriSyncRow.mock.invocationCallOrder[0]).toBeLessThan(
      h.authkit.mock.invocationCallOrder[0],
    )
  })

  it('resolves no attendee when the sign-in standing cannot be read (fail closed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getRedirectUriSyncRow.mockRejectedValue(new Error('sanity unavailable'))

    const ctx = await createTRPCContext({ req: request('wos-session=sealed') })

    expect(ctx.workosUser).toBeNull()
    expect(h.authkit).not.toHaveBeenCalled()
  })
})

/**
 * A REFRESHED SESSION MUST REACH THE BROWSER. WorkOS access tokens are
 * short-lived and refresh tokens are single-use. When `authkit()` refreshes
 * here it hands back the re-sealed session as a `Set-Cookie`; dropping it (as
 * this code used to) leaves the browser holding a cookie whose refresh token
 * has already been spent, so the NEXT request cannot refresh and the attendee
 * is signed out mid-registration.
 */
describe('createTRPCContext — a refreshed WorkOS session is persisted', () => {
  const REFRESHED =
    'wos-session=RESEALED; Path=/; HttpOnly; SameSite=Lax; Secure'

  it('forwards the re-sealed cookie to the response, uncacheable', async () => {
    h.authkit.mockResolvedValue({
      session: { user: { ...WORKOS_USER, emailVerified: true } },
      headers: new Headers([['Set-Cookie', REFRESHED]]),
    })
    const resHeaders = new Headers()

    const ctx = await createTRPCContext({
      req: request('wos-session=sealed'),
      resHeaders,
    })

    expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
    expect(resHeaders.getSetCookie()).toEqual([REFRESHED])
    expect(resHeaders.get('cache-control')).toBe('no-store')
  })

  it('forwards the session cookie only — nothing else the SDK may have set', async () => {
    h.authkit.mockResolvedValue({
      session: { user: { ...WORKOS_USER, emailVerified: true } },
      headers: new Headers([
        ['Set-Cookie', 'workos-access-token=JWT; SameSite=Lax'],
        ['Set-Cookie', REFRESHED],
        ['Set-Cookie', 'wos-auth-verifier-0a1b2c3d=STATE; Path=/'],
        ['x-workos-session', 'the-sealed-session'],
      ]),
    })
    const resHeaders = new Headers()

    await createTRPCContext({ req: request('wos-session=sealed'), resHeaders })

    expect(resHeaders.getSetCookie()).toEqual([REFRESHED])
    expect([...resHeaders.keys()].sort()).toEqual([
      'cache-control',
      'set-cookie',
    ])
  })

  it('follows a custom cookie name', async () => {
    vi.stubEnv('WORKOS_COOKIE_NAME', 'attendee')
    const renamed = 'attendee=RESEALED; Path=/; HttpOnly'
    h.authkit.mockResolvedValue({
      session: { user: { ...WORKOS_USER, emailVerified: true } },
      headers: new Headers([
        ['Set-Cookie', REFRESHED],
        ['Set-Cookie', renamed],
      ]),
    })
    const resHeaders = new Headers()

    await createTRPCContext({ req: request('attendee=sealed'), resHeaders })

    expect(resHeaders.getSetCookie()).toEqual([renamed])
  })

  it('writes nothing when the session did not need refreshing', async () => {
    h.authkit.mockResolvedValue({
      session: { user: { ...WORKOS_USER, emailVerified: true } },
      headers: new Headers([['x-workos-session', 'sealed']]),
    })
    const resHeaders = new Headers()

    await createTRPCContext({ req: request('wos-session=sealed'), resHeaders })

    expect([...resHeaders.keys()]).toEqual([])
  })

  /**
   * Two requests can race to refresh the same single-use token; the loser gets
   * no user and a cookie DELETION from the SDK. Forwarding that would let the
   * loser sign out the winner, so only a successful refresh is ever written.
   */
  it('never forwards a cookie deletion from a failed refresh', async () => {
    h.authkit.mockResolvedValue({
      session: { user: null },
      headers: new Headers([
        ['Set-Cookie', 'wos-session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT'],
      ]),
    })
    const resHeaders = new Headers()

    const ctx = await createTRPCContext({
      req: request('wos-session=sealed'),
      resHeaders,
    })

    expect(ctx.workosUser).toBeNull()
    expect([...resHeaders.keys()]).toEqual([])
  })
})

/**
 * The context can only persist a refresh if the ROUTE hands it the response
 * headers. This goes through the real `/api/trpc` handler and tRPC's fetch
 * adapter, so it is the wiring — not `createTRPCContext` — that is under test.
 */
describe('/api/trpc — the route lets the context write response headers', () => {
  it('returns the re-sealed session cookie on the HTTP response', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const refreshed = 'wos-session=RESEALED; Path=/; HttpOnly; Secure'
    h.authkit.mockResolvedValue({
      session: { user: { ...WORKOS_USER, emailVerified: true } },
      headers: new Headers([['Set-Cookie', refreshed]]),
    })
    const { GET } = await import('@/app/api/trpc/[trpc]/route')

    const response = await GET(
      request('wos-session=sealed', { procedures: 'workshop.getMySignups' }),
    )

    // Whatever the procedure itself answers, the cookie is on the response.
    expect(response.headers.getSetCookie()).toEqual([refreshed])
    expect(response.headers.get('cache-control')).toBe('no-store')
    // Importing every router takes seconds on a loaded machine.
  }, 30_000)
})

/**
 * THE READ BUDGET. The `wos-session` cookie is host-wide and lives for 400
 * days, so it rides on EVERY tRPC request from a browser that once signed in to
 * the portal — an organizer's whole admin session included. Only three
 * procedures consume the attendee identity, so only a request that names one
 * of them may spend a sign-in standing read (and an AuthKit session check) on
 * it. The portal's public lists (workshops, announcements) are not among them.
 */
describe('createTRPCContext — only the attendee procedures resolve the attendee', () => {
  it.each([
    ['the attendee’s own signups', 'workshop.getMySignups'],
    ['a signup', 'workshop.signup'],
    ['a cancellation', 'workshop.cancelSignup'],
    ['the portal’s first batch', 'workshop.list,workshop.getMySignups'],
    ['a batch that ends with one', 'conference.getCurrent,workshop.signup'],
    ['a percent-encoded batch', 'conference.getCurrent%2Cworkshop.signup'],
  ])('resolves it for %s', async (_label, procedures) => {
    const ctx = await createTRPCContext({
      req: request('wos-session=sealed', { procedures }),
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
  ])(
    'spends nothing on %s — no sign-in standing read, no AuthKit call',
    async (_label, procedures) => {
      const ctx = await createTRPCContext({
        req: request('wos-session=sealed', { procedures }),
      })

      expect(ctx.workosUser).toBeNull()
      expect(getRedirectUriSyncRow).not.toHaveBeenCalled()
      expect(h.authkit).not.toHaveBeenCalled()
    },
  )
})

/**
 * The prefilter above names the attendee procedures one by one. A procedure
 * that starts reading `ctx.workosUser` without being named there would see
 * `null` and refuse every attendee (fail closed, but silently), so the list
 * is held to the source: every reader, and nothing else.
 */
describe('the prefilter’s premise', () => {
  const ROUTERS = join(process.cwd(), 'src/server/routers')
  const READS_THE_ATTENDEE =
    /requireWorkshopAttendee\(|requireWorkshopUser\(|ctx\.workosUser/

  /** The top-level procedures of the workshop router that read the attendee. */
  function attendeeProcedures(): string[] {
    const source = readFileSync(join(ROUTERS, 'workshop.ts'), 'utf8')
    const body = source.slice(
      source.indexOf('export const workshopRouter = router({'),
    )
    // A top-level key of the router: two spaces of indentation (Prettier's).
    const keys = [...body.matchAll(/^ {2}(\w+): /gm)]
    return keys
      .filter((key, i) =>
        READS_THE_ATTENDEE.test(
          body.slice(key.index, keys[i + 1]?.index ?? body.length),
        ),
      )
      .map((key) => `workshop.${key[1]}`)
  }

  it('holds: the procedures that read the attendee are exactly the three it names', () => {
    expect(attendeeProcedures().sort()).toEqual([
      'workshop.cancelSignup',
      'workshop.getMySignups',
      'workshop.signup',
    ])
  })

  it('holds: the scan sees the router (control)', () => {
    const source = readFileSync(join(ROUTERS, 'workshop.ts'), 'utf8')
    // The names the scan must be able to tell apart are all really there.
    for (const name of ['list', 'announcementsByWorkshop', 'signup', 'admin']) {
      expect(source).toMatch(new RegExp(`^ {2}${name}: `, 'm'))
    }
  })

  it('holds: no other router reads the attendee', () => {
    const others = readdirSync(ROUTERS, { recursive: true })
      .map(String)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\./.test(file))
      .filter((file) => file !== 'workshop.ts')
      .filter((file) =>
        /workosUser/.test(readFileSync(join(ROUTERS, file), 'utf8')),
      )

    expect(others).toEqual([])
  })

  it('holds: each of them resolves the attendee, as mounted in the app router', async () => {
    // The full router graph asserts on its mail configuration at import.
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    const { appRouter } = await import('./_app')

    for (const procedure of attendeeProcedures()) {
      expect(Object.keys(appRouter._def.procedures)).toContain(procedure)
      const ctx = await createTRPCContext({
        req: request('wos-session=sealed', { procedures: procedure }),
      })
      expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
    }
    // Importing every router takes seconds on a loaded machine.
  }, 30_000)
})
