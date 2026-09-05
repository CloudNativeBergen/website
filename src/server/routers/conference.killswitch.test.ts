/**
 * @vitest-environment node
 *
 * THE TICKETING KILL SWITCH ON `conference.updateTicketingIds` (#850).
 *
 * #847 widened an operator's `enabled: false` to every organizer-visible output
 * by enumerating `fetchEventTickets` / `resolveTicketingProvider` call sites.
 * This procedure calls NEITHER — it writes the binding those calls later resolve
 * THROUGH — so the enumeration missed it, and an organizer of a switched-off org
 * could still rebind `checkinEventId` / `customerId` on their conference.
 *
 * The refusal is asserted on its exact message, not merely on FORBIDDEN:
 * `adminProcedure`'s own waist also throws FORBIDDEN ("Admin privileges
 * required"), so a code-only assertion would still pass with the gate deleted
 * for any case where the waist happened to reject. Here the caller IS an
 * organizer of the request org, so the waist admits the call and only the kill
 * switch can produce the observed error.
 *
 * The positive-control block is the same hard constraint #847 pinned: a
 * `community` org with no operator decision is NOT entitled to `ticketing` by
 * plan (`minPlan: 'pro'`) and yet keeps the surface on its own credentials
 * (`features/ticketing.ts` rule 2). Tighten this to `requireFeature` and that
 * block fails.
 *
 * The gate resolves through the REAL `@/lib/features/platform-default` +
 * `entitlements` over a mocked `getOrganizationById`, so override direction and
 * expiry are exercised rather than stubbed.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? 'cloudnativebergen.no' : null),
  }),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  getOrganizationById: vi.fn(),
  /** The stored-binding read AND the cross-tenant collision probe. */
  uncachedFetch: vi.fn(),
  commit: vi.fn(),
  /** `updatePublicFreeTickets` writes through a transaction, not a patch. */
  txCommit: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
  getConferenceForDomain: vi.fn(),
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: () => {
      const builder = {
        setIfMissing: () => builder,
        set: () => builder,
        unset: () => builder,
        commit: h.commit,
      }
      return builder
    },
    transaction: () => {
      const tx = {
        patch: () => tx,
        commit: h.txCommit,
      }
      return tx
    },
  },
  clientReadUncached: { fetch: h.uncachedFetch },
}))
vi.mock('@/lib/teams', () => ({ clearConferenceTeamsCache: vi.fn() }))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { conferenceRouter } from './conference'

const t = initTRPC.context<Context>().create()

const ORG = 'organization-cloud-native-days'
const CONF = 'conf-cndn'

/**
 * THE RULE-2 SHAPE: a `community` org (no `plan`) carrying no operator
 * override, which `computeEntitlements` does NOT grant `ticketing`.
 */
const communityOrgDocument = {
  _id: ORG,
  name: 'Cloud Native Days Norway',
  slug: 'cloud-native-days-norway',
}

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
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
  } as unknown as Context
}

const conference = () => t.createCallerFactory(conferenceRouter)(ctx())

/** Switch ticketing OFF for the request org, the way an operator does. */
function denyTicketing() {
  h.getOrganizationById.mockResolvedValue({
    ...communityOrgDocument,
    featureOverrides: [{ feature: 'ticketing', enabled: false }],
  })
}

/** A rebind of the provider event — the write under test. */
const REBIND = { checkinEventId: 9999 }

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      title: 'Cloud Native Days Bergen',
      organization: { _ref: ORG },
    },
    domain: 'cloudnativebergen.no',
    error: null,
  })
  h.getOrganizationById.mockResolvedValue(communityOrgDocument)
  // The stored-binding read returns the current document; the collision probe
  // is a `count(...)` and reports nobody else holds the requested binding.
  h.uncachedFetch.mockImplementation(async (query: string) =>
    query.startsWith('count(')
      ? 0
      : { checkinEventId: 4242, titoAccountSlug: null, titoEventSlug: null },
  )
  h.commit.mockResolvedValue({ _id: CONF })
})

describe('an operator deny refuses conference.updateTicketingIds (#850)', () => {
  it('is refused with the kill-switch message, not the admin-waist one', async () => {
    denyTicketing()
    await expect(conference().updateTicketingIds(REBIND)).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
        message:
          'The "ticketing" feature has been switched off for this organization',
      },
    )
  })

  it('makes no Sanity read and no write on a denied org', async () => {
    denyTicketing()
    await expect(conference().updateTicketingIds(REBIND)).rejects.toThrow()
    // Neither the stored-binding read, the collision probe, nor the patch.
    expect(h.uncachedFetch).not.toHaveBeenCalled()
    expect(h.commit).not.toHaveBeenCalled()
  })

  it('refuses a PAID org too — a deny beats the plan that sells ticketing', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      plan: 'pro',
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })
    await expect(conference().updateTicketingIds(REBIND)).rejects.toMatchObject(
      {
        message: expect.stringContaining('switched off'),
      },
    )
    expect(h.commit).not.toHaveBeenCalled()
  })

  it('leaves the REST of the conference router alone — a ticketing deny is not a settings freeze', async () => {
    denyTicketing()
    await expect(
      conference().updateBranding({ theme: null }),
    ).resolves.toBeDefined()
    expect(h.commit).toHaveBeenCalled()
  })
})

describe('a community org with no deny keeps rebinding (rule 2)', () => {
  it('writes the new binding', async () => {
    await expect(conference().updateTicketingIds(REBIND)).resolves.toBeDefined()
    expect(h.commit).toHaveBeenCalled()
  })

  it('is unaffected by an EXPIRED deny or a deny on another feature', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      featureOverrides: [
        {
          feature: 'ticketing',
          enabled: false,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
        { feature: 'badges', enabled: false },
      ],
    })
    await expect(conference().updateTicketingIds(REBIND)).resolves.toBeDefined()
  })

  it('is unaffected when the organization read REJECTS — an accident is not a decision', async () => {
    h.getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(conference().updateTicketingIds(REBIND)).resolves.toBeDefined()
  })
})

/**
 * THE SHAPE PRODUCTION ACTUALLY HAS: `plan: 'pro'`, `featureOverrides: null`.
 * It passes trivially under a deny-only gate, which is what a positive control
 * is for — it is the case that must not break silently.
 */
describe('the production shape keeps rebinding — pro plan, no overrides', () => {
  it('writes the new binding', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      plan: 'pro',
      featureOverrides: null,
    })
    await expect(conference().updateTicketingIds(REBIND)).resolves.toBeDefined()
    expect(h.commit).toHaveBeenCalled()
  })
})

/**
 * THE SAME KILL SWITCH ON `conference.updatePublicFreeTickets` (#860). It
 * publishes a free ticket type on the PUBLIC /tickets page — new public
 * ticketing surface a switched-off org must not gain — so it composes
 * `requireFeatureNotDenied('ticketing')` exactly like `updateTicketingIds`.
 * Same conventions as above: the exact kill-switch message (the admin waist
 * also throws FORBIDDEN), no write on a deny, and the rule-2 / production
 * positive controls.
 */
describe('an operator deny refuses conference.updatePublicFreeTickets (#860)', () => {
  const OPT_IN = { ticketId: 7, visible: true }

  it('is refused with the kill-switch message, not the admin-waist one', async () => {
    denyTicketing()
    await expect(
      conference().updatePublicFreeTickets(OPT_IN),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message:
        'The "ticketing" feature has been switched off for this organization',
    })
    expect(h.txCommit).not.toHaveBeenCalled()
  })

  it('refuses the hide direction too — a deny closes the whole admin plane', async () => {
    denyTicketing()
    await expect(
      conference().updatePublicFreeTickets({ ticketId: 7, visible: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.txCommit).not.toHaveBeenCalled()
  })

  it('leaves sibling settings mutations alone under the same deny', async () => {
    denyTicketing()
    await expect(
      conference().updateBranding({ theme: null }),
    ).resolves.toBeDefined()
    expect(h.commit).toHaveBeenCalled()
  })

  it('a community org with no deny keeps toggling (rule 2)', async () => {
    await expect(
      conference().updatePublicFreeTickets(OPT_IN),
    ).resolves.toBeDefined()
    expect(h.txCommit).toHaveBeenCalled()
  })

  it('the production shape keeps toggling — pro plan, no overrides', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      plan: 'pro',
      featureOverrides: null,
    })
    await expect(
      conference().updatePublicFreeTickets(OPT_IN),
    ).resolves.toBeDefined()
    expect(h.txCommit).toHaveBeenCalled()
  })
})
