/**
 * @vitest-environment node
 *
 * The org-scoped authorization WAIST (CaaS T1-2, #614). Exercises the real
 * `adminProcedure` middleware (`requireAdmin` in src/server/trpc.ts) end to end:
 * the request org comes from the domain conference, and access requires the
 * caller's `organizerOrgIds` to include it — `organizerOrgIds` and NOTHING else.
 * BOTH migration bridges to the deprecated GLOBAL `isOrganizer` flag are gone, so
 * this pins the whole contract:
 *
 *   - an organizer of the request org is ALLOWED; an organizer of another org is
 *     DENIED (the cross-org 403), as is a member of no org at all;
 *   - an UNRESOLVABLE org FAILS CLOSED (deny, with a warn when the denied caller
 *     organizes at least one org, so the failure mode stays observable);
 *   - a LEGACY TOKEN minted before #635 — the global flag set but NO
 *     `organizerOrgIds` — is DENIED ON EVERY HOST. Bridging it granted organizer
 *     rights on ANY host, because the global flag is true for an organizer of ANY
 *     org: a cross-tenant grant. Such a holder is an ordinary non-organizer until
 *     they sign in again.
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

  it('DENIES a LEGACY token (global flag, no organizerOrgIds) on a resolvable org', async () => {
    resolveOrg('org-A')
    // Pre-#635 token: `organizerOrgIds` absent ENTIRELY. The bridge that let the
    // global flag stand in is gone — it granted on ANY host, so it was a
    // cross-tenant grant.
    await expect(
      callerFor({ _id: 'sp-legacy', isOrganizer: true }).speaker.admin.list(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  describe('org unresolvable — FAILS CLOSED', () => {
    it('DENIES a would-be organizer (organizes some org) and warns on the denial', async () => {
      resolveOrg(null) // conference has no organization (unknown domain)
      // The warn fires only for a caller who organizes AT LEAST ONE org, so the
      // denial stays observable without spamming on ordinary traffic.
      await expect(
        callerFor({
          _id: 'sp-4',
          isOrganizer: true,
          organizerOrgIds: ['org-A'],
        }).speaker.admin.list(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
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

    it('DENIES (fail-closed) when domain resolution THROWS (maps to null, not error)', async () => {
      h.getConference.mockRejectedValue(new Error('no domain'))
      await expect(
        callerFor({
          _id: 'sp-6',
          isOrganizer: true,
          organizerOrgIds: [],
        }).speaker.admin.list(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })
})
