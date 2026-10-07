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
 * names a `workshop.*` procedure, only on a host the verified-redirect
 * allowlist admits, and with that host's own callback as `redirectUri` — the
 * same decision the proxy takes for the page, so the API cannot be more
 * permissive than the page. The Sanity boundary behind the allowlist is
 * supplied; the real decision runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { DomainVerificationRecord } from '@/lib/domain-verification/types'
import { verifiedHost } from '../../__tests__/helpers/workshopSignIn'

const h = vi.hoisted(() => ({ authkit: vi.fn() }))

const listAllowlistCandidates =
  vi.fn<() => Promise<DomainVerificationRecord[]>>()

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }))
vi.mock('@workos-inc/authkit-nextjs', () => ({ authkit: h.authkit }))
vi.mock('@/lib/domain-verification/sanity', () => ({
  listAllowlistCandidates: () => listAllowlistCandidates(),
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
  listAllowlistCandidates.mockResolvedValue([verifiedHost(HOST)])
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
    // Nor is the allowlist read: NextAuth-only traffic costs nothing here.
    expect(listAllowlistCandidates).not.toHaveBeenCalled()
  })
})

/**
 * The page and the API must take the SAME host decision (#1296). The proxy
 * refuses `/workshop` on a host that is not allowlisted; a session cookie
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

  it('resolves no attendee on a host that is not allowlisted, and never enters AuthKit', async () => {
    const ctx = await createTRPCContext({
      req: request('wos-session=sealed', { host: 'unverified.example.org' }),
    })

    expect(ctx.workosUser).toBeNull()
    expect(h.authkit).not.toHaveBeenCalled()
  })

  it('decides from the allowlist BEFORE AuthKit is called', async () => {
    await createTRPCContext({ req: request('wos-session=sealed') })

    expect(listAllowlistCandidates).toHaveBeenCalledOnce()
    expect(listAllowlistCandidates.mock.invocationCallOrder[0]).toBeLessThan(
      h.authkit.mock.invocationCallOrder[0],
    )
  })

  it('resolves no attendee when the allowlist cannot be read (fail closed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listAllowlistCandidates.mockRejectedValue(new Error('sanity unavailable'))

    const ctx = await createTRPCContext({ req: request('wos-session=sealed') })

    expect(ctx.workosUser).toBeNull()
    expect(h.authkit).not.toHaveBeenCalled()
  })
})

/**
 * THE READ BUDGET. The `wos-session` cookie is host-wide and lives for 400
 * days, so it rides on EVERY tRPC request from a browser that once signed in to
 * the portal — an organizer's whole admin session included. Only the
 * `workshop.*` procedures consume the attendee identity, so only a request that
 * names one may spend an allowlist read (and an AuthKit session check) on it.
 */
describe('createTRPCContext — only workshop procedures resolve the attendee', () => {
  it.each([
    ['a single workshop procedure', 'workshop.getMySignups'],
    ['a batch that includes one', 'conference.getCurrent,workshop.list'],
    ['a batch of several', 'workshop.list,workshop.getMySignups'],
    ['a nested workshop procedure', 'workshop.admin.getAllSignups'],
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
    ['a router that merely starts with the same letters', 'workshopping.list'],
    ['a procedure that merely mentions it', 'admin.workshop.list'],
    ['an empty path', ''],
  ])(
    'spends nothing on %s — no allowlist read, no AuthKit call',
    async (_label, procedures) => {
      const ctx = await createTRPCContext({
        req: request('wos-session=sealed', { procedures }),
      })

      expect(ctx.workosUser).toBeNull()
      expect(listAllowlistCandidates).not.toHaveBeenCalled()
      expect(h.authkit).not.toHaveBeenCalled()
    },
  )
})

/**
 * The prefilter above is only sound while the attendee procedures live under
 * the `workshop` key of the app router. If that router is ever mounted
 * elsewhere, every attendee would be refused at the API (fail closed, but
 * silently). A NEW consumer of `ctx.workosUser` outside `workshop.*` is not
 * caught here; it would see `null` and refuse.
 */
describe('the prefilter’s premise', () => {
  it('holds: every attendee procedure is named `workshop.*`', async () => {
    // The full router graph asserts on its mail configuration at import.
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    const { appRouter } = await import('./_app')

    // The three that consume `ctx.workosUser` (see routers/workshop.ts).
    expect(Object.keys(appRouter._def.procedures)).toEqual(
      expect.arrayContaining([
        'workshop.signup',
        'workshop.cancelSignup',
        'workshop.getMySignups',
      ]),
    )
  })
})
