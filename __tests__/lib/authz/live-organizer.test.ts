/**
 * @vitest-environment node
 *
 * Organizer rights on the NextAuth lane are re-read from Sanity (#1923), not
 * taken from the 30-day rolling token. Drives the real getAuthSession into the
 * real adminProcedure waist (`requireAdmin`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  getConference: vi.fn(),
  getSpeaker: vi.fn(),
  // Rights per speaker id, as Sanity would answer; `null` = read fails.
  rights: new Map<string, string[] | null>(),
  rightsReads: 0,
  getProposal: vi.fn(),
}))

vi.mock('next-auth', () => ({
  default: () => ({
    // Wrapper form `auth(handler)` sets req.auth from the token, as next-auth does.
    auth: (...a: unknown[]) =>
      typeof a[0] === 'function'
        ? async (req: { auth?: unknown }) => {
            req.auth = await h.auth()
            return (a[0] as (r: unknown) => unknown)(req)
          }
        : h.auth(...a),
    signIn: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
  }),
  AuthError: class AuthError extends Error {},
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('@/lib/proposal/server', async (orig) => ({
  ...(await orig<object>()),
  getProposal: h.getProposal,
}))
// handleUpload runs the route's token gate on the pathname it is given.
vi.mock('@vercel/blob/client', () => ({
  handleUpload: async (o: {
    body: { pathname: string }
    onBeforeGenerateToken: (p: string) => Promise<unknown>
  }) => {
    await o.onBeforeGenerateToken(o.body.pathname)
    return { ok: true }
  },
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: async () => 'org-A',
}))
vi.mock('@/lib/speaker', async (orig) => ({
  ...(await orig<object>()),
  getSpeaker: h.getSpeaker,
}))
vi.mock('@/lib/sanity/client', async (orig) => {
  const real = await orig<typeof import('@/lib/sanity/client')>()
  return {
    ...real,
    clientReadUncached: {
      ...real.clientReadUncached,
      fetch: async (query: string, params: { id?: string }) => {
        if (!query.includes('"organizerOrgIds"')) return []
        h.rightsReads++
        const orgs = h.rights.get(params.id!)
        if (orgs === null) throw new Error('sanity down')
        return { organizerOrgIds: orgs ?? [], isOrganizer: !!orgs?.length }
      },
    },
  }
})
vi.mock('@/lib/environment/config', async (orig) => {
  const real = await orig<typeof import('@/lib/environment/config')>()
  return {
    AppEnvironment: Object.assign(Object.create(real.AppEnvironment), {
      isTestMode: false,
      isDevelopment: true,
    }),
  }
})

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { appRouter } from '@/server/_app'
import { getAuthSession } from '@/lib/auth'
import { clearOrganizerRightsMemo } from '@/lib/authz/live-organizer'

const createCaller = initTRPC
  .context<Context>()
  .create()
  .createCallerFactory(appRouter)

// The token claims org-A, as minted at sign-in.
function token(id: string) {
  return {
    expires: new Date(Date.now() + 86_400_000).toISOString(),
    user: { email: `${id}@example.com`, name: id, picture: '' },
    speaker: { _id: id, isOrganizer: true, organizerOrgIds: ['org-A'] },
  }
}

async function adminAllowed(url = 'http://localhost:3000/'): Promise<boolean> {
  const session = await getAuthSession({ url, headers: new Headers() })
  try {
    await createCaller({
      req: { headers: new Headers(), url } as unknown as Context['req'],
      session,
      speaker: session?.speaker,
      user: session?.user,
      workosUser: null,
      ipAddress: '127.0.0.1',
    } as unknown as Context).speaker.admin.list()
    return true
  } catch (err) {
    if ((err as { code?: string }).code === 'FORBIDDEN') return false
    throw err
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  clearOrganizerRightsMemo()
  h.rights.clear()
  h.rightsReads = 0
  h.auth.mockReset()
  h.getConference.mockResolvedValue({
    conference: { _id: 'conf-1', organization: { _ref: 'org-A' } },
    domain: 'localhost',
    error: null,
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('live organizer rights (#1923)', () => {
  it('a removed organizer loses /admin within 60 s', async () => {
    h.auth.mockResolvedValue(token('sp-1'))
    h.rights.set('sp-1', ['org-A'])
    expect(await adminAllowed()).toBe(true)

    h.rights.set('sp-1', [])
    vi.advanceTimersByTime(30_000)
    expect(await adminAllowed()).toBe(true) // memo still holds
    vi.advanceTimersByTime(31_000)
    expect(await adminAllowed()).toBe(false)
  })

  it('an added organizer gains /admin, even with a token that lacks it', async () => {
    h.auth.mockResolvedValue({
      ...token('sp-2'),
      speaker: { _id: 'sp-2', organizerOrgIds: [] },
    })
    expect(await adminAllowed()).toBe(false)
    h.rights.set('sp-2', ['org-A'])
    vi.advanceTimersByTime(61_000)
    expect(await adminAllowed()).toBe(true)
  })

  it('a failed refresh refuses, not falling back to the token claim', async () => {
    h.auth.mockResolvedValue(token('sp-3'))
    h.rights.set('sp-3', null)
    expect(await adminAllowed()).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        '[authz-deny] organizer refresh failed for speaker sp-3',
      ),
      'sanity down',
    )
    // A failure is not cached: the next request reads again.
    h.rights.set('sp-3', ['org-A'])
    expect(await adminAllowed()).toBe(true)
  })

  it('a failure within 10 min of a good read serves the good read', async () => {
    h.auth.mockResolvedValue(token('sp-g1'))
    h.rights.set('sp-g1', ['org-A'])
    expect(await adminAllowed()).toBe(true)
    h.rights.set('sp-g1', null)
    vi.advanceTimersByTime(9 * 60_000)
    expect(await adminAllowed()).toBe(true)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[authz-grace] organizer refresh failed for speaker sp-g1',
      ),
    )
  })

  it('a failure more than 10 min after the last good read refuses', async () => {
    h.auth.mockResolvedValue(token('sp-g2'))
    h.rights.set('sp-g2', ['org-A'])
    expect(await adminAllowed()).toBe(true)
    h.rights.set('sp-g2', null)
    vi.advanceTimersByTime(10 * 60_000 + 1_000)
    expect(await adminAllowed()).toBe(false)
  })

  it('the grace serves only a good read, never a revocation-free token', async () => {
    // Removed at the last good read: the grace keeps the removal.
    h.auth.mockResolvedValue(token('sp-g3'))
    h.rights.set('sp-g3', [])
    expect(await adminAllowed()).toBe(false)
    h.rights.set('sp-g3', null)
    vi.advanceTimersByTime(61_000)
    expect(await adminAllowed()).toBe(false)
  })

  it('upload token: a removed organizer gets no organizer proposal access after 60 s', async () => {
    const { POST } = await import('@/app/api/upload/proposal-attachment/route')
    h.auth.mockResolvedValue(token('sp-u'))
    h.rights.set('sp-u', ['org-A'])
    h.getProposal.mockResolvedValue({ proposal: null, proposalError: null })
    const id = '11111111-2222-3333-4444-555555555555'
    const call = () =>
      (POST as unknown as (r: unknown) => Promise<Response>)(
        new Request('http://localhost:3000/api/upload/proposal-attachment', {
          method: 'POST',
          body: JSON.stringify({ pathname: `proposal-${id}-1-a.pdf` }),
        }),
      )
    await call()
    expect(h.getProposal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id,
        isOrganizer: true,
        organizerOrgId: 'org-A',
      }),
    )
    h.rights.set('sp-u', [])
    vi.advanceTimersByTime(61_000)
    await call()
    expect(h.getProposal).toHaveBeenLastCalledWith(
      expect.objectContaining({ id, isOrganizer: false, organizerOrgId: null }),
    )
  })

  it('reads Sanity once per speaker per 60 s', async () => {
    h.auth.mockResolvedValue(token('sp-4'))
    h.rights.set('sp-4', ['org-A'])
    for (let i = 0; i < 5; i++) await getAuthSession()
    expect(h.rightsReads).toBe(1)
    vi.advanceTimersByTime(61_000)
    await getAuthSession()
    expect(h.rightsReads).toBe(2)
  })

  it('impersonation keeps the real admin rights, refreshed', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    h.auth.mockResolvedValue(token('admin-1'))
    h.rights.set('admin-1', ['org-A'])
    h.getSpeaker.mockResolvedValue({
      speaker: { _id: 'target-1', email: 't@example.com', isOrganizer: false },
    })
    const url = 'http://localhost:3000/?impersonate=target-1'
    const s1 = await getAuthSession({ url, headers: new Headers() })
    expect(s1?.isImpersonating).toBe(true)
    expect(s1?.realAdmin?.organizerOrgIds).toEqual(['org-A'])

    h.rights.set('admin-1', [])
    vi.advanceTimersByTime(61_000)
    const s2 = await getAuthSession({ url, headers: new Headers() })
    expect(s2?.isImpersonating).toBeUndefined()
    expect(s2?.speaker?.organizerOrgIds).toEqual([])
    vi.unstubAllEnvs()
  })
})
