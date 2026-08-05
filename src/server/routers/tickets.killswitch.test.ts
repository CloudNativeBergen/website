/**
 * @vitest-environment node
 *
 * THE TICKETING KILL SWITCH AT THE tRPC LAYER (#836).
 *
 * #834 made an operator's `enabled: false` a hard kill switch across the
 * organizer UI. `tickets.admin.*` was left as plain `adminProcedure`, so an
 * authenticated organizer of a switched-off org could still call every
 * procedure directly — and `createDiscountCode` / `deleteDiscountCode` still
 * WROTE to that tenant's provider account. The owner decision widened the switch
 * to every organizer-visible output; this file is the observer for the router
 * half of it.
 *
 * TWO THINGS ARE UNDER TEST AND THEY PULL IN OPPOSITE DIRECTIONS:
 *
 *  1. EVERY procedure refuses a denied org, with no provider call and no Sanity
 *     write. The refusal is asserted on its exact message, not merely on
 *     FORBIDDEN: `adminProcedure`'s own waist also throws FORBIDDEN, so a
 *     code-only assertion would still pass with the gate deleted for any case
 *     where the waist happened to reject. Here the caller IS an organizer of the
 *     request org, so the waist admits it — the message check makes the gate the
 *     only thing in this file that can produce the observed error.
 *  2. THE SAME CALLS SUCCEED for the org this deployment actually runs
 *     (`organization-cloud-native-days`: no `plan`, no overrides — exactly what
 *     migration 044 created). That org is NOT entitled to `ticketing` by plan,
 *     so a gate built on `requireFeature` would 403 all of it. The
 *     positive-control block fails if anyone tightens the gate that way.
 *
 * The gate resolves through the REAL `@/lib/features/platform-default` +
 * `entitlements` over a mocked `getOrganizationById`, so override direction and
 * expiry are exercised rather than stubbed.
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
  resolveCredentials: vi.fn(),
  listDiscounts: vi.fn(),
  createDiscount: vi.fn(),
  deleteDiscount: vi.fn(),
  fetchEventTickets: vi.fn(),
  fetchOrderPaymentDetails: vi.fn(),
  commit: vi.fn(),
  sanityFetch: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: () => ({ set: () => ({ commit: h.commit }) }),
    fetch: h.sanityFetch,
  },
  clientReadUncached: { fetch: vi.fn() },
}))
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingCredentials: h.resolveCredentials,
  getTicketingProvider: () => ({
    listDiscounts: h.listDiscounts,
    createDiscount: h.createDiscount,
    deleteDiscount: h.deleteDiscount,
    fetchEventTickets: h.fetchEventTickets,
    fetchOrderPaymentDetails: h.fetchOrderPaymentDetails,
  }),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { ticketsRouter, __resetOrderIdCache } from './tickets'

const t = initTRPC.context<Context>().create()

/** The tenant this deployment runs. Migration 044 created it with no plan. */
const ORG = 'organization-cloud-native-days'
const CONF = 'conf-cndn'
const EVENT = 4242
const CUSTOMER = 7

/** The organization document as migration 044 wrote it: no plan, no overrides. */
const liveOrgDocument = {
  _id: ORG,
  name: 'Cloud Native Days Norway',
  slug: 'cloud-native-days',
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

const tickets = () => t.createCallerFactory(ticketsRouter)(ctx())

/** Switch ticketing OFF for the request org, the way an operator does. */
function denyTicketing() {
  h.getOrganizationById.mockResolvedValue({
    ...liveOrgDocument,
    featureOverrides: [{ feature: 'ticketing', enabled: false }],
  })
}

/**
 * Every procedure in `tickets.admin.*`, invoked with input the happy path
 * accepts. The list is the point: the gate is one middleware on the sub-router,
 * so a fourteenth procedure inherits it — this table proves the thirteen that
 * exist today are all behind it.
 */
const PROCEDURES: Array<
  [string, (c: ReturnType<typeof tickets>) => Promise<unknown>]
> = [
  ['getSettings', (c) => c.admin.getSettings()],
  ['updateSettings', (c) => c.admin.updateSettings({ ticketCapacity: 500 })],
  ['updateCapacity', (c) => c.admin.updateCapacity({ capacity: 500 })],
  [
    'updateTargets',
    (c) =>
      c.admin.updateTargets({
        targets: {
          enabled: true,
          salesStartDate: '2026-01-01',
          targetCurve: 'linear',
          milestones: [],
        },
      }),
  ],
  [
    'toggleTargetTracking',
    (c) => c.admin.toggleTargetTracking({ enabled: true }),
  ],
  ['getTicketTypes', (c) => c.admin.getTicketTypes()],
  ['getDiscountCodes', (c) => c.admin.getDiscountCodes({ eventId: EVENT })],
  ['getDiscountCodesWithUsage', (c) => c.admin.getDiscountCodesWithUsage()],
  [
    'createDiscountCode',
    (c) =>
      c.admin.createDiscountCode({
        eventId: EVENT,
        discountCode: 'SPONSOR-ACME',
        numberOfTickets: 5,
        sponsorName: 'Acme',
        selectedTicketTypes: [],
      }),
  ],
  [
    'deleteDiscountCode',
    (c) => c.admin.deleteDiscountCode({ eventId: EVENT, discountCode: 'OURS' }),
  ],
  ['getPaymentDetails', (c) => c.admin.getPaymentDetails({ orderId: 500 })],
  ['getPageContent', (c) => c.admin.getPageContent()],
  [
    'updatePageContent',
    (c) =>
      c.admin.updatePageContent({
        ticketInclusions: [{ _key: 'k1', title: 'Lunch' }],
      }),
  ],
]

beforeEach(() => {
  vi.clearAllMocks()
  __resetOrderIdCache()
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      title: 'Cloud Native Days Bergen',
      organization: { _ref: ORG },
      checkinEventId: EVENT,
      checkinCustomerId: CUSTOMER,
    },
    domain: 'localhost',
    error: null,
  })
  h.getOrganizationById.mockResolvedValue(liveOrgDocument)
  h.resolveCredentials.mockResolvedValue({ apiKey: 'k', apiSecret: 's' })
  h.listDiscounts.mockResolvedValue({ discounts: [], ticketTypes: [] })
  h.createDiscount.mockResolvedValue({ id: 1 })
  h.deleteDiscount.mockResolvedValue(true)
  h.fetchEventTickets.mockResolvedValue([
    { id: 1, order_id: 500, sum: '100', category: 'Regular', order_date: '' },
  ])
  h.fetchOrderPaymentDetails.mockResolvedValue({ id: 1, orderId: 500 })
  h.commit.mockResolvedValue({ _id: CONF })
  h.sanityFetch.mockResolvedValue({ _id: CONF, ticketCapacity: 400 })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('an operator deny refuses EVERY tickets.admin procedure (#836)', () => {
  it.each(PROCEDURES)('%s is refused', async (_name, call) => {
    denyTicketing()
    await expect(call(tickets())).rejects.toMatchObject({
      code: 'FORBIDDEN',
      // Verbatim: `adminProcedure`'s waist throws FORBIDDEN too ("Admin
      // privileges required"), and this caller IS an organizer of the request
      // org, so only the kill switch can produce this message.
      message:
        'The "ticketing" feature has been switched off for this organization',
    })
  })

  it('makes no provider call and no Sanity write on a denied org', async () => {
    denyTicketing()
    for (const [, call] of PROCEDURES) {
      await expect(call(tickets())).rejects.toThrow()
    }
    // Reads AND writes, at the vendor and in Sanity.
    expect(h.resolveCredentials).not.toHaveBeenCalled()
    expect(h.listDiscounts).not.toHaveBeenCalled()
    expect(h.fetchEventTickets).not.toHaveBeenCalled()
    expect(h.fetchOrderPaymentDetails).not.toHaveBeenCalled()
    // The two that mutate the tenant's OWN provider account.
    expect(h.createDiscount).not.toHaveBeenCalled()
    expect(h.deleteDiscount).not.toHaveBeenCalled()
    expect(h.commit).not.toHaveBeenCalled()
    expect(h.sanityFetch).not.toHaveBeenCalled()
  })

  it('refuses a PAID org too — a deny beats the plan that sells ticketing', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...liveOrgDocument,
      plan: 'pro',
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })
    await expect(
      tickets().admin.createDiscountCode({
        eventId: EVENT,
        discountCode: 'FREE',
        numberOfTickets: 1,
        sponsorName: 'Acme',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('switched off'),
    })
    expect(h.createDiscount).not.toHaveBeenCalled()
  })
})

/**
 * THE HARD CONSTRAINT (owner, non-negotiable): the existing tenant must lose
 * nothing. `organization-cloud-native-days` carries NO plan, so it resolves to
 * `community`, and `ticketing` is `readiness: 'ga'` + `minPlan: 'pro'` — an
 * entitlement-shaped gate (`requireFeature('ticketing')`) would refuse every
 * call below. A deny-shaped gate does not.
 */
describe('the live tenant keeps full access — no override, no plan', () => {
  it.each(PROCEDURES)('%s still answers', async (_name, call) => {
    await expect(call(tickets())).resolves.toBeDefined()
  })

  it('still reaches the provider for reads and for writes', async () => {
    await tickets().admin.getDiscountCodes({ eventId: EVENT })
    expect(h.listDiscounts).toHaveBeenCalledWith(EVENT)

    await tickets().admin.createDiscountCode({
      eventId: EVENT,
      discountCode: 'SPONSOR-ACME',
      numberOfTickets: 5,
      sponsorName: 'Acme',
    })
    expect(h.createDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT }),
    )
  })

  it('is unaffected by an EXPIRED deny or a deny on another feature', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...liveOrgDocument,
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
      tickets().admin.getDiscountCodes({ eventId: EVENT }),
    ).resolves.toMatchObject({ success: true })
  })

  it('is unaffected when the organization read REJECTS — an accident is not a decision', async () => {
    h.getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(
      tickets().admin.getDiscountCodes({ eventId: EVENT }),
    ).resolves.toMatchObject({ success: true })
  })
})
