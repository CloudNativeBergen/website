/**
 * @vitest-environment node
 *
 * THE TICKETING KILL SWITCH ON `sponsor.crm.sendDiscountEmail` (#850).
 *
 * #847 widened an operator's `enabled: false` by enumerating
 * `fetchEventTickets` / `resolveTicketingProvider` call sites. This procedure
 * calls neither — it mails a CLIENT-SUPPLIED discount code to a sponsor's
 * contacts — so the enumeration missed it, and a switched-off org kept mailing
 * its sponsors on its own behalf. The absence of a provider call is what hid
 * it, not what makes it harmless: nothing about the send depends on the
 * ticketing integration still being switched on.
 *
 * The refusal is asserted on its exact message, not merely on FORBIDDEN:
 * `adminProcedure`'s own waist also throws FORBIDDEN ("Admin privileges
 * required"), so a code-only assertion would still pass with the gate deleted
 * for any case where the waist happened to reject. Here the caller IS an
 * organizer of the request org, so the waist admits the call and only the kill
 * switch can produce the observed error.
 *
 * The neighbouring sponsor mail is under test in the opposite direction: a
 * ticketing deny must not silence sponsor contact in general, only the discount
 * send. And the positive-control blocks pin `features/ticketing.ts` rule 2 — a
 * `community` org is not entitled to `ticketing` by plan yet keeps the surface,
 * so an entitlement-shaped gate would fail them.
 *
 * The gate resolves through the REAL `@/lib/features/platform-default` +
 * `entitlements` over a mocked `getOrganizationById`.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  getOrganizationById: vi.fn(),
  sanityFetch: vi.fn(),
  sendIndividualEmail: vi.fn(),
  sendBroadcastEmail: vi.fn(),
  logEmailSent: vi.fn(),
  logBulkEmailSent: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/sanity/client', () => {
  const client = {
    fetch: h.sanityFetch,
    patch: () => {
      const chain = {
        set: () => chain,
        unset: () => chain,
        setIfMissing: () => chain,
        commit: async () => ({}),
      }
      return chain
    },
    transaction: () => {
      const tx = { patch: () => tx, commit: async () => ({}) }
      return tx
    },
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})
vi.mock('@/lib/email/broadcast', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  sendIndividualEmail: h.sendIndividualEmail,
  sendBroadcastEmail: h.sendBroadcastEmail,
}))
vi.mock('@/lib/sponsor-crm/activity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  logEmailSent: h.logEmailSent,
  logBulkEmailSent: h.logBulkEmailSent,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { sponsorRouter } from './sponsor'

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

const sponsor = () => t.createCallerFactory(sponsorRouter)(ctx())

/** Switch ticketing OFF for the request org, the way an operator does. */
function denyTicketing() {
  h.getOrganizationById.mockResolvedValue({
    ...communityOrgDocument,
    featureOverrides: [{ feature: 'ticketing', enabled: false }],
  })
}

const DISCOUNT_INPUT = {
  sponsorId: 'sponsor-acme',
  discountCode: 'ACME-2026',
  subject: 'Your sponsor tickets',
  message: JSON.stringify([
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'Here you go.' }],
    },
  ]),
  ticketUrl: 'https://example.test/tickets',
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      title: 'Cloud Native Days Bergen',
      organizer: 'CNDN',
      organization: { _ref: ORG },
      sponsorEmail: 'sponsors@example.test',
    },
    domain: 'localhost',
    error: null,
  })
  h.getOrganizationById.mockResolvedValue(communityOrgDocument)
  h.sanityFetch.mockResolvedValue({
    _id: 'sfc-1',
    sponsor: { name: 'Acme AS' },
    contactPersons: [{ _key: 'c1', name: 'Jane Doe', email: 'jane@acme.test' }],
  })
  h.sendIndividualEmail.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  })
  h.sendBroadcastEmail.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('an operator deny refuses sponsor.crm.sendDiscountEmail (#850)', () => {
  it('is refused with the kill-switch message, not the admin-waist one', async () => {
    denyTicketing()
    await expect(
      sponsor().crm.sendDiscountEmail(DISCOUNT_INPUT),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message:
        'The "ticketing" feature has been switched off for this organization',
    })
  })

  it('sends no mail and reads no sponsor on a denied org', async () => {
    denyTicketing()
    await expect(
      sponsor().crm.sendDiscountEmail(DISCOUNT_INPUT),
    ).rejects.toThrow()
    expect(h.sendIndividualEmail).not.toHaveBeenCalled()
    expect(h.sanityFetch).not.toHaveBeenCalled()
  })

  it('refuses a PAID org too — a deny beats the plan that sells ticketing', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      plan: 'pro',
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })
    await expect(
      sponsor().crm.sendDiscountEmail(DISCOUNT_INPUT),
    ).rejects.toMatchObject({
      message: expect.stringContaining('switched off'),
    })
    expect(h.sendIndividualEmail).not.toHaveBeenCalled()
  })

  it('leaves ordinary sponsor mail alone — a ticketing deny is not a contact ban', async () => {
    denyTicketing()
    await expect(
      sponsor().crm.broadcastEmail({
        subject: 'Thanks for sponsoring',
        message: DISCOUNT_INPUT.message,
      }),
    ).resolves.toBeDefined()
    expect(h.sendBroadcastEmail).toHaveBeenCalled()
  })
})

describe('a community org with no deny keeps sending discount codes (rule 2)', () => {
  it('mails the sponsor contact', async () => {
    await expect(
      sponsor().crm.sendDiscountEmail(DISCOUNT_INPUT),
    ).resolves.toMatchObject({
      sponsorName: 'Acme AS',
      discountCode: 'ACME-2026',
    })
    expect(h.sendIndividualEmail).toHaveBeenCalledWith(
      expect.objectContaining({ primaryRecipient: 'jane@acme.test' }),
    )
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
    await expect(
      sponsor().crm.sendDiscountEmail(DISCOUNT_INPUT),
    ).resolves.toBeDefined()
  })

  it('is unaffected when the organization read REJECTS — an accident is not a decision', async () => {
    h.getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(
      sponsor().crm.sendDiscountEmail(DISCOUNT_INPUT),
    ).resolves.toBeDefined()
  })
})

/**
 * THE SHAPE PRODUCTION ACTUALLY HAS: `plan: 'pro'`, `featureOverrides: null`.
 * It passes trivially under a deny-only gate, which is what a positive control
 * is for — it is the case that must not break silently.
 */
describe('the production shape keeps sending — pro plan, no overrides', () => {
  it('mails the sponsor contact', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      plan: 'pro',
      featureOverrides: null,
    })
    await expect(
      sponsor().crm.sendDiscountEmail(DISCOUNT_INPUT),
    ).resolves.toBeDefined()
    expect(h.sendIndividualEmail).toHaveBeenCalled()
  })
})
