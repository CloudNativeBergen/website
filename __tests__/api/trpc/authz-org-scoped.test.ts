/**
 * @vitest-environment node
 *
 * The org-scoped authorization WAIST (CaaS T1-2, #614). Exercises the real
 * `adminProcedure` middleware (`requireAdmin` in src/server/trpc.ts) end to end:
 * the request org comes from the domain conference, and access requires the
 * caller's `organizerOrgIds` to include it. Proves the cross-org 403, the fail-
 * closed (resolvable org, non-member) path, and the legacy bridge (org
 * unresolvable → deprecated global `isOrganizer`, with a warn).
 *
 * `getConferenceForCurrentDomain` is mocked to control the request's org; callers
 * are built with explicit session shapes so `organizerOrgIds` can be varied.
 */
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))

const h = vi.hoisted(() => ({ getConference: vi.fn() }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { appRouter } from '@/server/_app'

const t = initTRPC.context<Context>().create()
const createCaller = t.createCallerFactory(appRouter)

function callerFor(speaker: {
  _id: string
  isOrganizer?: boolean
  organizerOrgIds?: string[]
}) {
  const user = { email: 'org@example.com', name: 'Org', picture: '' }
  return createCaller({
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  })
}

function resolveOrg(orgId: string | null) {
  h.getConference.mockResolvedValue({
    conference: orgId
      ? { _id: 'conf-1', organization: { _ref: orgId } }
      : { _id: 'conf-1' },
    domain: 'localhost',
    error: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// `speaker.admin.list` is an adminProcedure — the FIRST thing it hits is the
// org-scoped `requireAdmin` waist. A rejection with FORBIDDEN means the waist
// denied; any OTHER outcome (resolves, or throws a non-FORBIDDEN code from the
// endpoint body) means the waist ALLOWED the call through.
async function wasAllowed(
  caller: ReturnType<typeof callerFor>,
): Promise<boolean> {
  try {
    await caller.speaker.admin.list()
    return true
  } catch (err) {
    return (err as { code?: string }).code !== 'FORBIDDEN'
  }
}

describe('adminProcedure waist — org-scoped organizer authorization', () => {
  it('ALLOWS an organizer of the request org', async () => {
    resolveOrg('org-A')
    const allowed = await wasAllowed(
      callerFor({ _id: 'sp-1', organizerOrgIds: ['org-A'] }),
    )
    expect(allowed).toBe(true)
  })

  it('DENIES an organizer of ANOTHER org (cross-org 403)', async () => {
    resolveOrg('org-A')
    await expect(
      callerFor({
        _id: 'sp-2',
        isOrganizer: true,
        organizerOrgIds: ['org-B'],
      }).speaker.admin.list(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('FAILS CLOSED for a resolvable org when the caller is not a member', async () => {
    resolveOrg('org-A')
    // Globally flagged organizer, but NOT a member of the resolved org.
    await expect(
      callerFor({
        _id: 'sp-3',
        isOrganizer: true,
        organizerOrgIds: [],
      }).speaker.admin.list(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  describe('legacy bridge — org unresolvable', () => {
    it('ALLOWS via the deprecated global isOrganizer and warns', async () => {
      resolveOrg(null) // conference has no organization (pre-backfill)
      const caller = callerFor({
        _id: 'sp-4',
        isOrganizer: true,
        organizerOrgIds: [],
      })
      expect(await wasAllowed(caller)).toBe(true)
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[authz-bridge]'),
      )
    })

    it('DENIES a non-organizer even when the org is unresolvable', async () => {
      resolveOrg(null)
      await expect(
        callerFor({
          _id: 'sp-5',
          isOrganizer: false,
          organizerOrgIds: [],
        }).speaker.admin.list(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('bridges when domain resolution THROWS (fail-closed to bridge, not error)', async () => {
      h.getConference.mockRejectedValue(new Error('no domain'))
      const caller = callerFor({
        _id: 'sp-6',
        isOrganizer: true,
        organizerOrgIds: [],
      })
      expect(await wasAllowed(caller)).toBe(true)
    })
  })
})
