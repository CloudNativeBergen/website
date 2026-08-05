/**
 * @vitest-environment node
 *
 * TENANCY FOR PROVIDER IDS (#731 F5).
 *
 * `checkin()` used to be constructed from ONE process-wide `CHECKIN_API_KEY` /
 * `CHECKIN_API_SECRET` pair shared by every tenant (it now resolves per-org
 * through `resolveTicketingCredentials`). Four `tickets.admin.*`
 * procedures took the Checkin `eventId` / `orderId` straight from client input
 * and never compared it with the request's own conference, so an organizer of
 * tenant A could mint 100%-off codes on tenant B's paid sale (the router
 * hardcodes `discountValue: 100`), delete B's live sponsor codes, read the
 * redeemable strings, and read another tenant's customer's payment details.
 * `eventId`s are small enumerable integers.
 *
 * These are provider ids, not Sanity ids, so the document guards cannot see
 * them: the fix is to DERIVE the event id from the request's conference and
 * refuse a mismatch.
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
  resolveCredentials: vi.fn(),
  listDiscounts: vi.fn(),
  createDiscount: vi.fn(),
  deleteDiscount: vi.fn(),
  fetchEventTickets: vi.fn(),
  fetchOrderPaymentDetails: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
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
const ORG_A = 'org-A'
const CONF_A = 'conf-A'
/** The event id THIS conference owns. */
const OUR_EVENT = 4242
/** Another tenant's event on the same shared Checkin account. */
const THEIR_EVENT = 4243

function ctx(orgId: string = ORG_A): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [orgId],
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

const tickets = (orgId?: string) =>
  t.createCallerFactory(ticketsRouter)(ctx(orgId))

beforeEach(() => {
  vi.clearAllMocks()
  // The order-id memo (#731 N1) is module state; a case must never inherit the
  // previous one's enumeration.
  __resetOrderIdCache()
  h.resolveCredentials.mockResolvedValue({ apiKey: 'k', apiSecret: 's' })
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF_A,
      organization: { _ref: ORG_A },
      checkinEventId: OUR_EVENT,
      checkinCustomerId: 7,
    },
    domain: 'localhost',
    error: null,
  })
  h.listDiscounts.mockResolvedValue({ discounts: [], ticketTypes: [] })
  h.createDiscount.mockResolvedValue({ id: 1 })
  h.deleteDiscount.mockResolvedValue(true)
  // Our event's orders. Order 999 belongs to somebody else's event.
  h.fetchEventTickets.mockResolvedValue([{ id: 1, order_id: 500 }])
  h.fetchOrderPaymentDetails.mockResolvedValue({ id: 1, orderId: 500 })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('tickets discount codes are bound to this conference’s event (#731 F5)', () => {
  it('createDiscountCode refuses another tenant’s eventId', async () => {
    await expect(
      tickets().admin.createDiscountCode({
        eventId: THEIR_EVENT,
        discountCode: 'FREE',
        numberOfTickets: 5,
        sponsorName: 'Acme',
        selectedTicketTypes: [],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.createDiscount).not.toHaveBeenCalled()
  })

  it('createDiscountCode uses OUR event id, never the payload’s', async () => {
    await tickets().admin.createDiscountCode({
      eventId: OUR_EVENT,
      discountCode: 'FREE',
      numberOfTickets: 5,
      sponsorName: 'Acme',
      selectedTicketTypes: [],
    })
    expect(h.createDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: OUR_EVENT }),
    )
  })

  it('deleteDiscountCode refuses another tenant’s eventId', async () => {
    await expect(
      tickets().admin.deleteDiscountCode({
        eventId: THEIR_EVENT,
        discountCode: 'THEIRS',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.deleteDiscount).not.toHaveBeenCalled()
  })

  it('deleteDiscountCode still deletes our own code', async () => {
    await tickets().admin.deleteDiscountCode({
      eventId: OUR_EVENT,
      discountCode: 'OURS',
    })
    expect(h.deleteDiscount).toHaveBeenCalledWith(OUR_EVENT, 'OURS')
  })

  it('getDiscountCodes refuses another tenant’s eventId', async () => {
    await expect(
      tickets().admin.getDiscountCodes({ eventId: THEIR_EVENT }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.listDiscounts).not.toHaveBeenCalled()
  })

  it('getDiscountCodes still lists our own codes', async () => {
    await tickets().admin.getDiscountCodes({ eventId: OUR_EVENT })
    expect(h.listDiscounts).toHaveBeenCalledWith(OUR_EVENT)
  })

  it('a conference with no checkin configuration refuses — fail closed', async () => {
    h.getConference.mockResolvedValue({
      conference: { _id: CONF_A, organization: { _ref: ORG_A } },
      domain: 'localhost',
      error: null,
    })
    await expect(
      tickets().admin.getDiscountCodes({ eventId: OUR_EVENT }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.listDiscounts).not.toHaveBeenCalled()
  })
})

describe('tickets payment details are bound to this conference’s orders (#731 F5)', () => {
  it('getPaymentDetails refuses an order that is not in our event', async () => {
    await expect(
      tickets().admin.getPaymentDetails({ orderId: 999 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.fetchOrderPaymentDetails).not.toHaveBeenCalled()
  })

  it('getPaymentDetails still reads one of our own orders', async () => {
    await tickets().admin.getPaymentDetails({ orderId: 500 })
    expect(h.fetchOrderPaymentDetails).toHaveBeenCalledWith(500)
  })

  it('FAILS CLOSED when the ticket list cannot be read', async () => {
    h.fetchEventTickets.mockRejectedValue(new Error('checkin down'))
    await expect(
      tickets().admin.getPaymentDetails({ orderId: 500 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.fetchOrderPaymentDetails).not.toHaveBeenCalled()
  })

  /**
   * #731 N1. The guard's enumeration is `fetchEventTicketsRaw` + a paginated
   * order sweep against ONE platform-wide Checkin credential, so an
   * unrate-limited call per lookup lets any tenant's organizer throttle
   * ticketing for every tenant.
   */
  it('memoizes the order enumeration instead of re-running it per call', async () => {
    await tickets().admin.getPaymentDetails({ orderId: 500 })
    await tickets().admin.getPaymentDetails({ orderId: 500 })
    // A MISS must not re-enumerate either — that is the attacker's loop.
    await expect(
      tickets().admin.getPaymentDetails({ orderId: 999 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.fetchEventTickets).toHaveBeenCalledTimes(1)
  })

  it('does NOT cache a failed enumeration', async () => {
    h.fetchEventTickets.mockRejectedValueOnce(new Error('checkin down'))
    await expect(
      tickets().admin.getPaymentDetails({ orderId: 500 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // The next call must retry rather than serve the rejection for the TTL.
    await tickets().admin.getPaymentDetails({ orderId: 500 })
    expect(h.fetchOrderPaymentDetails).toHaveBeenCalledWith(500)
    expect(h.fetchEventTickets).toHaveBeenCalledTimes(2)
  })
})

/**
 * CROSS-TENANT CREDENTIAL ISOLATION for this router.
 *
 * Distinct from the id-ownership guards above: those stop a tenant addressing
 * another tenant's event WITH the account it holds; these stop it holding the
 * platform's account at all. The router used to build its client straight from
 * `platformCheckinCredentials()`, bypassing the per-org seam every other
 * ticketing surface goes through.
 */
describe('the router credentials per-organization, never off the platform env', () => {
  it('resolves credentials for the request conference’s OWNING org', async () => {
    await tickets().admin.getDiscountCodes({ eventId: OUR_EVENT })
    expect(h.resolveCredentials).toHaveBeenCalledWith(ORG_A, 'checkin')
  })

  it('REFUSES every provider call when the seam has no credentials for the org', async () => {
    h.resolveCredentials.mockResolvedValue(null)

    await expect(
      tickets().admin.getDiscountCodes({ eventId: OUR_EVENT }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      tickets().admin.createDiscountCode({
        eventId: OUR_EVENT,
        discountCode: 'FREE',
        numberOfTickets: 1,
        sponsorName: 'Acme',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      tickets().admin.deleteDiscountCode({
        eventId: OUR_EVENT,
        discountCode: 'FREE',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    // BAD_REQUEST, not NOT_FOUND: credentials resolve BEFORE the order-ownership
    // enumeration (which needs a provider to run at all), so an uncredentialed
    // org is refused a step earlier. It discloses nothing about another tenant —
    // it is a statement about the caller's own organization.
    await expect(
      tickets().admin.getPaymentDetails({ orderId: 500 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(h.listDiscounts).not.toHaveBeenCalled()
    expect(h.createDiscount).not.toHaveBeenCalled()
    expect(h.deleteDiscount).not.toHaveBeenCalled()
    expect(h.fetchOrderPaymentDetails).not.toHaveBeenCalled()
    expect(h.fetchEventTickets).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED for a conference with no owning organization', async () => {
    h.getConference.mockResolvedValue({
      conference: {
        _id: CONF_A,
        checkinEventId: OUR_EVENT,
        checkinCustomerId: 7,
      },
      domain: 'localhost',
      error: null,
    })
    // The org-scoped `adminProcedure` waist refuses first — it cannot match the
    // caller's `organizerOrgIds` against an unresolvable owner. So no credential
    // is even requested, let alone the platform's.
    await expect(
      tickets().admin.getDiscountCodes({ eventId: OUR_EVENT }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.resolveCredentials).not.toHaveBeenCalled()
    expect(h.listDiscounts).not.toHaveBeenCalled()
  })
})

/**
 * ACCOUNT-SCOPED CACHE KEYS.
 *
 * Checkin `customerId` / `eventId` are numeric ids unique only WITHIN one
 * Checkin account, so two orgs holding their OWN accounts can legitimately carry
 * the same pair. The order-id memo is a process-global `Map`, so a key built
 * from those ids alone would serve the first org's cached order set to the
 * second — cross-tenant data leakage through the cache rather than through the
 * credential, defeating the credential seam one layer up.
 *
 * The two orgs below share `customerId: 7` / `eventId: 4242` deliberately. That
 * is the whole point: identical provider ids, different accounts.
 */
describe('the order-id memo is scoped to the ACCOUNT, not just the numeric ids', () => {
  const ORG_B = 'org-B'

  /** Same numeric binding as ORG_A's conference — different owner. */
  function asOrgB() {
    h.getConference.mockResolvedValue({
      conference: {
        _id: 'conf-B',
        organization: { _ref: ORG_B },
        checkinEventId: OUR_EVENT,
        checkinCustomerId: 7,
      },
      domain: 'localhost',
      error: null,
    })
    // A DIFFERENT Checkin account, whose event 4242 holds a different order set.
    h.resolveCredentials.mockResolvedValue({
      apiKey: 'B-key',
      apiSecret: 'B-s',
    })
    h.fetchEventTickets.mockResolvedValue([{ id: 9, order_id: 900 }])
  }

  it('does NOT serve org A’s cached order set to org B', async () => {
    // Warm the memo as org A: its account's event 4242 holds order 500.
    await tickets(ORG_A).admin.getPaymentDetails({ orderId: 500 })
    expect(h.fetchEventTickets).toHaveBeenCalledTimes(1)

    asOrgB()

    // Order 500 exists in A's account, NOT in B's. A shared key would admit it.
    await expect(
      tickets(ORG_B).admin.getPaymentDetails({ orderId: 500 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // B must have enumerated its OWN account rather than reading A's entry.
    expect(h.fetchEventTickets).toHaveBeenCalledTimes(2)
    expect(h.resolveCredentials).toHaveBeenLastCalledWith(ORG_B, 'checkin')
  })

  it('lets org B read its OWN order with the same numeric ids', async () => {
    await tickets(ORG_A).admin.getPaymentDetails({ orderId: 500 })

    asOrgB()
    await tickets(ORG_B).admin.getPaymentDetails({ orderId: 900 })
    expect(h.fetchOrderPaymentDetails).toHaveBeenLastCalledWith(900)
  })

  it('still memoizes WITHIN one account (the rate limiter survives the fix)', async () => {
    await tickets(ORG_A).admin.getPaymentDetails({ orderId: 500 })
    await tickets(ORG_A).admin.getPaymentDetails({ orderId: 500 })
    expect(h.fetchEventTickets).toHaveBeenCalledTimes(1)
  })
})
