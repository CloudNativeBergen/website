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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ authkit: vi.fn() }))

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }))
vi.mock('@workos-inc/authkit-nextjs', () => ({ authkit: h.authkit }))

import { createTRPCContext } from './trpc'

function request(cookie?: string) {
  return new NextRequest('https://conf.example.test/api/trpc/workshop.signup', {
    headers: cookie ? { cookie } : {},
  })
}

const WORKOS_USER = {
  id: 'user_01',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
}

beforeEach(() => vi.clearAllMocks())

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
  })
})
