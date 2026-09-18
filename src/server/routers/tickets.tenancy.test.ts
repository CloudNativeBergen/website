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
  buildTicketSummary: vi.fn(),
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
// STUBBED ON PURPOSE: the summary's own arithmetic is covered in
// `@/lib/tickets/summary.test.ts`. What this file asserts is that a caller from
// another tenant never gets far enough to run it.
vi.mock('@/lib/tickets/summary', () => ({
  buildTicketSummary: h.buildTicketSummary,
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
import { clientWrite } from '@/lib/sanity/client'
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
  h.buildTicketSummary.mockResolvedValue({ state: 'ready' })
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

/**
 * STANDALONE CODES — a code with no sponsor attached (a community discount, a
 * partner code, a one-off).
 *
 * One procedure serves both kinds, so the risk is not that standalone codes do
 * not work but that making them possible changed what a SPONSOR code sends.
 * Every case here asserts on the arguments that reach the provider, because
 * that is the only place the two kinds can diverge.
 */
describe('standalone discount codes (no sponsor)', () => {
  it('creates a code with no sponsor, at the rate asked for', async () => {
    const result = await tickets().admin.createDiscountCode({
      eventId: OUR_EVENT,
      discountCode: 'COMMUNITY2026',
      numberOfTickets: 25,
      discountPercentage: 20,
      selectedTicketTypes: ['3'],
    })

    expect(h.createDiscount).toHaveBeenCalledWith({
      eventId: OUR_EVENT,
      discountCode: 'COMMUNITY2026',
      numberOfTickets: 25,
      ticketTypes: ['3'],
      discountType: 'percentage',
      discountValue: 20,
    })
    // The confirmation names the code, since nothing else identifies it: the
    // provider stores no label for a discount.
    expect(result.message).toBe(
      'Created discount code "COMMUNITY2026" with 25 tickets at 20% off',
    )
  })

  /**
   * THE REGRESSION. A sponsor code must still be a 100%-off comp and still read
   * exactly as it did before standalone codes existed.
   */
  it('leaves a sponsor code byte-for-byte as it was', async () => {
    const result = await tickets().admin.createDiscountCode({
      eventId: OUR_EVENT,
      discountCode: 'ACME1234',
      numberOfTickets: 5,
      sponsorName: 'Acme',
      tierTitle: 'Gold',
      selectedTicketTypes: ['1', '2'],
    })

    expect(h.createDiscount).toHaveBeenCalledWith({
      eventId: OUR_EVENT,
      discountCode: 'ACME1234',
      numberOfTickets: 5,
      ticketTypes: ['1', '2'],
      discountType: 'percentage',
      discountValue: 100,
    })
    expect(result.message).toBe(
      'Created discount code "ACME1234" for Acme (Gold tier) with 5 tickets',
    )
  })

  it('refuses another tenant’s eventId for a standalone code too', async () => {
    await expect(
      tickets().admin.createDiscountCode({
        eventId: THEIR_EVENT,
        discountCode: 'COMMUNITY2026',
        numberOfTickets: 25,
        discountPercentage: 20,
        selectedTicketTypes: [],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.createDiscount).not.toHaveBeenCalled()
  })

  it.each([0, 101, 20.5])('refuses %s as a percentage', async (pct) => {
    await expect(
      tickets().admin.createDiscountCode({
        eventId: OUR_EVENT,
        discountCode: 'BAD',
        numberOfTickets: 1,
        discountPercentage: pct,
        selectedTicketTypes: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.createDiscount).not.toHaveBeenCalled()
  })

  /**
   * A STANDALONE CODE MAY NOT CARRY A SPONSOR'S NAME.
   *
   * The panel attributes a code to a sponsor by substring, so `PARTNER-NDC`
   * does not merely display under sponsor "NDC" — it takes that sponsor's row
   * over: the row reports the standalone code's redemptions as the sponsor's
   * entitlement usage, stops offering to create the real 100% comp, and aims
   * "send email" and "delete code" at the wrong code.
   *
   * These fail on the PROVIDER NEVER BEING CALLED plus a specific refusal code,
   * not on an absence: a test that passed because some other guard refused
   * first would prove nothing, so the accepted cases below run the same inputs
   * through to `createDiscount`.
   */
  describe('a standalone code may not carry a sponsor’s name', () => {
    beforeEach(() => {
      h.getConference.mockResolvedValue({
        conference: {
          _id: CONF_A,
          organization: { _ref: ORG_A },
          checkinEventId: OUR_EVENT,
          checkinCustomerId: 7,
          sponsors: [
            { sponsor: { name: 'NDC' } },
            { sponsor: { name: 'Acme Cloud' } },
          ],
        },
        domain: 'localhost',
        error: null,
      })
    })

    it.each(['PARTNER-NDC', 'ndc2026', 'SUMMER-ACMECLOUD-25'])(
      'refuses %s',
      async (discountCode) => {
        await expect(
          tickets().admin.createDiscountCode({
            eventId: OUR_EVENT,
            discountCode,
            numberOfTickets: 25,
            discountPercentage: 20,
            selectedTicketTypes: [],
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' })
        expect(h.createDiscount).not.toHaveBeenCalled()
      },
    )

    it('names the sponsor it collided with', async () => {
      await expect(
        tickets().admin.createDiscountCode({
          eventId: OUR_EVENT,
          discountCode: 'PARTNER-NDC',
          numberOfTickets: 1,
          selectedTicketTypes: [],
        }),
      ).rejects.toThrow(/sponsor name "NDC"/)
    })

    it('still accepts a code that carries no sponsor name', async () => {
      await tickets().admin.createDiscountCode({
        eventId: OUR_EVENT,
        discountCode: 'COMMUNITY2026',
        numberOfTickets: 25,
        discountPercentage: 20,
        selectedTicketTypes: [],
      })
      expect(h.createDiscount).toHaveBeenCalledWith(
        expect.objectContaining({ discountCode: 'COMMUNITY2026' }),
      )
    })

    /**
     * THE EXEMPTION. A sponsor code is GENERATED from the sponsor's name, so
     * it always collides by this rule — refusing it would break the path this
     * branch is supposed to leave untouched.
     */
    it('still accepts a SPONSOR code built from that same name', async () => {
      await tickets().admin.createDiscountCode({
        eventId: OUR_EVENT,
        discountCode: 'NDC1234',
        numberOfTickets: 5,
        sponsorName: 'NDC',
        tierTitle: 'Gold',
        selectedTicketTypes: [],
      })
      expect(h.createDiscount).toHaveBeenCalledWith(
        expect.objectContaining({
          discountCode: 'NDC1234',
          discountValue: 100,
        }),
      )
    })

    /**
     * FAILS CLOSED. `getConferenceForCurrentDomain` swallows a read failure
     * into `error` and returns a conference with NO `sponsors`, which is
     * indistinguishable from a conference that has none — so without this the
     * guard would quietly accept a colliding code whenever Sanity hiccuped.
     * Asserts the provider was never called, not merely that it threw.
     */
    it('refuses when the sponsor read FAILED rather than assuming none', async () => {
      // ONLY the `sponsors: true` read fails. Failing every call would trip
      // the org resolution first and refuse with FORBIDDEN — a refusal that
      // has nothing to do with this guard and would pass a test asserting
      // merely "it threw".
      const healthy = {
        conference: {
          _id: CONF_A,
          organization: { _ref: ORG_A },
          checkinEventId: OUR_EVENT,
          checkinCustomerId: 7,
        },
        domain: 'localhost',
        error: null,
      }
      h.getConference.mockImplementation(
        async (options?: { sponsors?: boolean }) =>
          options?.sponsors
            ? { ...healthy, conference: null, error: new Error('sanity down') }
            : healthy,
      )

      await expect(
        tickets().admin.createDiscountCode({
          eventId: OUR_EVENT,
          discountCode: 'COMMUNITY2026',
          numberOfTickets: 1,
          selectedTicketTypes: [],
        }),
        // The MESSAGE, not just the code. Removing the guard leaves
        // `conference` null and the next line throws a TypeError, which the
        // procedure's own catch also reports as INTERNAL_SERVER_ERROR — so a
        // test asserting only the code passes with the guard deleted. This
        // fails unless THIS refusal produced it.
      ).rejects.toThrow(/Could not read this conference.s sponsors/)
      expect(h.createDiscount).not.toHaveBeenCalled()
    })

    it('accepts everything when the conference has no sponsors', async () => {
      h.getConference.mockResolvedValue({
        conference: {
          _id: CONF_A,
          organization: { _ref: ORG_A },
          checkinEventId: OUR_EVENT,
          checkinCustomerId: 7,
          sponsors: [],
        },
        domain: 'localhost',
        error: null,
      })

      await tickets().admin.createDiscountCode({
        eventId: OUR_EVENT,
        discountCode: 'PARTNER-NDC',
        numberOfTickets: 1,
        selectedTicketTypes: [],
      })
      expect(h.createDiscount).toHaveBeenCalled()
    })
  })

  it('refuses a code the event already has', async () => {
    h.listDiscounts.mockResolvedValue({
      discounts: [{ triggerValue: 'COMMUNITY2026' }],
      ticketTypes: [],
    })

    await expect(
      tickets().admin.createDiscountCode({
        eventId: OUR_EVENT,
        discountCode: 'COMMUNITY2026',
        numberOfTickets: 25,
        discountPercentage: 20,
        selectedTicketTypes: [],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(h.createDiscount).not.toHaveBeenCalled()
  })

  it('deletes a standalone code through the same procedure', async () => {
    await tickets().admin.deleteDiscountCode({
      eventId: OUR_EVENT,
      discountCode: 'COMMUNITY2026',
    })
    expect(h.deleteDiscount).toHaveBeenCalledWith(OUR_EVENT, 'COMMUNITY2026')
  })

  /**
   * Usage is counted per CODE, off the event's tickets — it never consulted a
   * sponsor, so a standalone code is reported exactly like a sponsor one.
   */
  it('counts redemptions for a standalone code', async () => {
    h.listDiscounts.mockResolvedValue({
      discounts: [
        { triggerValue: 'COMMUNITY2026', times: 99 },
        { triggerValue: 'ACME1234', times: 99 },
      ],
      ticketTypes: [],
    })
    h.fetchEventTickets.mockResolvedValue([
      { id: 1, coupon: 'community2026', sum: '800' },
      { id: 2, coupon: 'COMMUNITY2026', sum: '800' },
      { id: 3, discount: 'ACME1234', sum: '0' },
    ])

    const result = await tickets().admin.getDiscountCodesWithUsage()
    const byCode = Object.fromEntries(
      result.discounts.map((d) => [d.triggerValue, d.actualUsage]),
    )

    expect(result.usageStatus).toBe('resolved')
    // Case-insensitively matched, and OURS (2) rather than the vendor's 99.
    expect(byCode.COMMUNITY2026).toMatchObject({
      usageCount: 2,
      ticketIds: [1, 2],
      totalPaid: 1600,
    })
    expect(byCode.ACME1234).toMatchObject({ usageCount: 1, ticketIds: [3] })
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

/**
 * `setTicketTypeRole` — the organizer's answer to "does this type seat a
 * human?", written to `conference.ticketTypeRoles` from /admin/tickets/types.
 *
 * It is a WRITE on a tenant document that MOVES THE PARTICIPANT COUNT, so it
 * carries the same two obligations as its `ticketCapacity` neighbours: the
 * conference is derived from the request domain (there is no conference id on
 * the input for a cross-tenant write to travel on), and the org-scoped
 * `adminProcedure` waist must refuse an organizer of another tenant.
 */
describe('setTicketTypeRole declares one ticket type’s role', () => {
  const UPGRADE = 'Sponsor discount (workshop upgrade)'
  /** The patch chain, so a case can assert WHICH operations were issued. */
  const patch = {
    set: vi.fn(),
    setIfMissing: vi.fn(),
    unset: vi.fn(),
    insert: vi.fn(),
    ifRevisionId: vi.fn(),
    commit: vi.fn(),
  }

  beforeEach(() => {
    for (const op of Object.values(patch)) op.mockReset().mockReturnValue(patch)
    patch.commit.mockResolvedValue({ _id: CONF_A })
    vi.mocked(clientWrite.patch).mockReturnValue(
      patch as unknown as ReturnType<typeof clientWrite.patch>,
    )
    // Every write is conditioned on the revision the preserve-read saw.
    vi.mocked(clientWrite.fetch).mockResolvedValue({ _rev: 'rev-1' } as never)
  })

  it('writes THIS type’s entry and leaves the others alone', async () => {
    await tickets().admin.setTicketTypeRole({
      typeName: UPGRADE,
      admits: false,
    })

    expect(clientWrite.patch).toHaveBeenCalledWith(CONF_A)
    // Only this type's entry is removed — by an ESCAPED literal, since the name
    // lands in a patch PATH rather than a parameter.
    expect(patch.unset).toHaveBeenCalledWith([
      `ticketTypeRoles[typeName == "Sponsor discount (workshop upgrade)"]`,
    ])
    // ...and the replacement is APPENDED. Never `set({ ticketTypeRoles: [...] })`:
    // replacing the whole list would let two organizers confirming two different
    // types in the same minute clobber each other.
    expect(patch.setIfMissing).toHaveBeenCalledWith({ ticketTypeRoles: [] })
    expect(patch.insert).toHaveBeenCalledWith('after', 'ticketTypeRoles[-1]', [
      expect.objectContaining({ typeName: UPGRADE, admits: false }),
    ])
    expect(patch.set).not.toHaveBeenCalled()
    // Sanity rejects an array item with no `_key`, and a missing one corrupts
    // array addressing rather than erroring where it was written.
    expect(patch.insert.mock.calls[0][2][0]._key).toEqual(expect.any(String))
    expect(patch.commit).toHaveBeenCalled()
  })

  /**
   * `grantsWorkshop` is ACCESS CONTROL (`@/lib/workshop/eligibility`), and this
   * write replaces the whole entry. Dropping the flag while toggling the
   * unrelated `admits` would revoke /workshop for everyone holding that type,
   * silently, from a control that says nothing about workshops.
   */
  it('PRESERVES the workshop-access flag it is not being asked to change', async () => {
    vi.mocked(clientWrite.fetch).mockResolvedValueOnce({
      _rev: 'rev-1',
      roles: [{ typeName: UPGRADE, grantsWorkshop: true }],
    } as never)

    await tickets().admin.setTicketTypeRole({
      typeName: UPGRADE,
      admits: false,
    })

    expect(patch.insert).toHaveBeenCalledWith('after', 'ticketTypeRoles[-1]', [
      expect.objectContaining({ admits: false, grantsWorkshop: true }),
    ])
  })

  /**
   * THE RACE. Preserving a field by reading it is a read-modify-write: a Studio
   * edit landing between the read and the patch would be overwritten by the
   * stale value — silently revoking or restoring /workshop for every holder of
   * that type. The patch shape is atomic for OTHER entries and does nothing for
   * this one, so the write must be conditioned on the revision it was computed
   * from.
   */
  it('CONDITIONS the write on the revision the preserve-read saw', async () => {
    vi.mocked(clientWrite.fetch).mockResolvedValueOnce({
      _rev: 'rev-7',
      roles: [{ typeName: UPGRADE, grantsWorkshop: true }],
    } as never)

    await tickets().admin.setTicketTypeRole({
      typeName: UPGRADE,
      admits: false,
    })

    expect(patch.ifRevisionId).toHaveBeenCalledWith('rev-7')
  })

  it('does NOT write a stale flag when the document moves under it', async () => {
    // The read sees `grantsWorkshop: true`; Studio then turns it OFF and the
    // conditional commit loses. The retry must re-read and carry the WINNER's
    // value forward — never re-assert the stale `true`.
    vi.mocked(clientWrite.fetch)
      .mockResolvedValueOnce({
        _rev: 'rev-1',
        roles: [{ typeName: UPGRADE, grantsWorkshop: true }],
      } as never)
      .mockResolvedValueOnce({
        _rev: 'rev-2',
        roles: [{ typeName: UPGRADE, grantsWorkshop: false }],
      } as never)
    patch.commit
      .mockRejectedValueOnce(
        Object.assign(new Error('revision mismatch'), { statusCode: 409 }),
      )
      .mockResolvedValueOnce({ _id: CONF_A })

    await tickets().admin.setTicketTypeRole({
      typeName: UPGRADE,
      admits: false,
    })

    expect(patch.ifRevisionId).toHaveBeenNthCalledWith(1, 'rev-1')
    expect(patch.ifRevisionId).toHaveBeenNthCalledWith(2, 'rev-2')
    const written = patch.insert.mock.calls.at(-1)![2][0]
    expect(written).toMatchObject({ admits: false, grantsWorkshop: false })
  })

  it('surfaces a CONFLICT rather than guessing when it loses twice', async () => {
    patch.commit.mockRejectedValue(
      Object.assign(new Error('revision mismatch'), { statusCode: 409 }),
    )

    await expect(
      tickets().admin.setTicketTypeRole({ typeName: UPGRADE, admits: false }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(patch.commit).toHaveBeenCalledTimes(2)
  })

  it('refuses to write unconditionally when no revision can be read', async () => {
    vi.mocked(clientWrite.fetch).mockResolvedValue(null as never)

    await expect(
      tickets().admin.setTicketTypeRole({ typeName: UPGRADE, admits: false }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  it('honours an override that contradicts the evidence', async () => {
    // Discovery may propose `admits: false` for a type from co-holding; a human
    // saying otherwise is the whole point of the control, so `true` is written
    // exactly as asked.
    await tickets().admin.setTicketTypeRole({ typeName: UPGRADE, admits: true })

    expect(patch.insert).toHaveBeenCalledWith('after', 'ticketTypeRoles[-1]', [
      expect.objectContaining({ typeName: UPGRADE, admits: true }),
    ])
  })

  it('escapes a type name that would otherwise widen the unset filter', async () => {
    await tickets().admin.setTicketTypeRole({
      typeName: 'Odd" or true]//',
      admits: false,
    })

    expect(patch.unset).toHaveBeenCalledWith([
      'ticketTypeRoles[typeName == "Odd\\" or true]//"]',
    ])
  })

  /**
   * THE TENANCY ASSERTION. ORG_B's organizer against ORG_A's domain conference:
   * the waist resolves the org from the DOMAIN and refuses, and the write must
   * never reach Sanity. Asserted on the patch never being issued, not merely on
   * a rejection — a refusal alone could come from anywhere in the chain.
   */
  it('REFUSES an organizer of another tenant', async () => {
    await expect(
      tickets('org-B').admin.setTicketTypeRole({
        typeName: UPGRADE,
        admits: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  it('still lets THIS conference’s organizer write', async () => {
    await tickets(ORG_A).admin.setTicketTypeRole({
      typeName: UPGRADE,
      admits: false,
    })
    expect(clientWrite.patch).toHaveBeenCalledWith(CONF_A)
  })

  it('FAILS CLOSED when the conference cannot be resolved', async () => {
    h.getConference.mockResolvedValue({
      conference: null,
      domain: 'localhost',
      error: new Error('sanity down'),
    })
    await expect(
      tickets().admin.setTicketTypeRole({ typeName: UPGRADE, admits: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  /**
   * THE WORKSHOP HALF of the same entry — `grantsWorkshop`, which is ACCESS
   * CONTROL rather than a count (`@/lib/workshop/eligibility`).
   *
   * Two obligations beyond its neighbour's. The two fields are written by two
   * separate controls, so each must survive the other being saved — in BOTH
   * directions. And the carry-over the UI offers (declaring the types that were
   * granting access through the legacy bridge, in the same action) is only
   * honest if it lands as ONE patch: a half-applied cliff revokes /workshop for
   * the types that did not make it.
   */
  describe('setWorkshopAccess declares workshop access', () => {
    const SPEAKER = 'Speaker ticket'
    const TWO_DAY = 'Workshop + Conference (2 days)'

    it('writes ONLY the workshop flag, preserving a declared `admits`', async () => {
      vi.mocked(clientWrite.fetch).mockResolvedValueOnce({
        _rev: 'rev-1',
        roles: [{ typeName: UPGRADE, admits: false }],
      } as never)

      await tickets().admin.setWorkshopAccess({
        updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
      })

      expect(patch.insert).toHaveBeenCalledWith(
        'after',
        'ticketTypeRoles[-1]',
        [
          expect.objectContaining({
            typeName: UPGRADE,
            admits: false,
            grantsWorkshop: true,
          }),
        ],
      )
    })

    /**
     * And it does not INVENT one. An entry that only answers the workshop
     * question leaves `admits` absent, which `classifyTicket` reads exactly as
     * no entry at all — counted as seating one attendee, reported as
     * undeclared. Writing `admits: true` here would make the participant count
     * claim a human blessed it.
     */
    it('does not fabricate a seating declaration nobody made', async () => {
      await tickets().admin.setWorkshopAccess({
        updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
      })

      const written = patch.insert.mock.calls[0][2][0]
      expect(written).toMatchObject({ typeName: UPGRADE, grantsWorkshop: true })
      expect(written).not.toHaveProperty('admits')
    })

    it('CONDITIONS the write on the revision the preserve-read saw', async () => {
      vi.mocked(clientWrite.fetch).mockResolvedValueOnce({
        _rev: 'rev-9',
        roles: [],
      } as never)

      await tickets().admin.setWorkshopAccess({
        updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
      })

      expect(patch.ifRevisionId).toHaveBeenCalledWith('rev-9')
    })

    /** THE ATOMICITY CLAIM: one patch, one commit, every type in it. */
    it('carries several types over in ONE patch', async () => {
      vi.mocked(clientWrite.fetch).mockResolvedValueOnce({
        _rev: 'rev-1',
        roles: [{ typeName: TWO_DAY, admits: true }],
      } as never)

      await tickets().admin.setWorkshopAccess({
        updates: [
          { typeName: SPEAKER, grantsWorkshop: true },
          { typeName: TWO_DAY, grantsWorkshop: true },
          { typeName: UPGRADE, grantsWorkshop: true },
        ],
      })

      expect(clientWrite.patch).toHaveBeenCalledTimes(1)
      expect(patch.commit).toHaveBeenCalledTimes(1)
      expect(patch.unset).toHaveBeenCalledWith([
        `ticketTypeRoles[typeName == "Speaker ticket"]`,
        `ticketTypeRoles[typeName == "Workshop + Conference (2 days)"]`,
        `ticketTypeRoles[typeName == "Sponsor discount (workshop upgrade)"]`,
      ])
      const inserted = patch.insert.mock.calls[0][2]
      expect(inserted).toHaveLength(3)
      expect(inserted.map((r: { typeName: string }) => r.typeName)).toEqual([
        SPEAKER,
        TWO_DAY,
        UPGRADE,
      ])
      // Each one keeps its own `admits`, and only the one that had it.
      expect(inserted[1]).toMatchObject({ admits: true, grantsWorkshop: true })
      expect(inserted[0]).not.toHaveProperty('admits')
    })

    /**
     * THE CASE TRAP. Everything that READS this array folds the name
     * (`typeKey`: trim + lowercase) — `classifyTicket`, `workshopAccessOf`,
     * the page that renders the cards. A write that matched exactly left a
     * Studio-typed `speaker ticket` in place and APPENDED the vendor's
     * `Speaker ticket` beside it, so the toggle reported success while the
     * stale entry kept deciding who gets into /workshop.
     */
    it('replaces an entry that differs only in case, rather than duplicating it', async () => {
      vi.mocked(clientWrite.fetch).mockResolvedValueOnce({
        _rev: 'rev-1',
        roles: [
          {
            typeName: ' speaker ticket ',
            admits: false,
            grantsWorkshop: false,
          },
        ],
      } as never)

      await tickets().admin.setWorkshopAccess({
        updates: [{ typeName: SPEAKER, grantsWorkshop: true }],
      })

      // BOTH spellings are removed — the vendor's, and the one actually stored.
      expect(patch.unset).toHaveBeenCalledWith([
        `ticketTypeRoles[typeName == "Speaker ticket"]`,
        `ticketTypeRoles[typeName == " speaker ticket "]`,
      ])
      // ...and exactly one entry replaces them, carrying the seating answer
      // that the exact-match read could not even see.
      const inserted = patch.insert.mock.calls[0][2]
      expect(inserted).toHaveLength(1)
      expect(inserted[0]).toMatchObject({
        typeName: SPEAKER,
        admits: false,
        grantsWorkshop: true,
      })
    })

    it('refuses a batch that names the same type twice', async () => {
      await expect(
        tickets().admin.setWorkshopAccess({
          updates: [
            { typeName: SPEAKER, grantsWorkshop: true },
            { typeName: ' speaker ticket ', grantsWorkshop: false },
          ],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(clientWrite.patch).not.toHaveBeenCalled()
    })

    it('surfaces a CONFLICT rather than guessing when it loses twice', async () => {
      patch.commit.mockRejectedValue(
        Object.assign(new Error('revision mismatch'), { statusCode: 409 }),
      )

      await expect(
        tickets().admin.setWorkshopAccess({
          updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(patch.commit).toHaveBeenCalledTimes(2)
    })

    /** THE TENANCY ASSERTION, asserted like its neighbours: on the patch. */
    it('REFUSES an organizer of another tenant', async () => {
      await expect(
        tickets('org-B').admin.setWorkshopAccess({
          updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(clientWrite.patch).not.toHaveBeenCalled()
    })

    it('still lets THIS conference’s organizer write', async () => {
      await tickets(ORG_A).admin.setWorkshopAccess({
        updates: [{ typeName: UPGRADE, grantsWorkshop: true }],
      })
      expect(clientWrite.patch).toHaveBeenCalledWith(CONF_A)
    })
  })
})

/**
 * THE READ SIDE OF THE SAME WAIST. `tickets.admin.summary` returns every
 * computed figure for the request's conference — counts, revenue, the free
 * allocation — so it is exactly the endpoint an organizer of another tenant
 * would like to call against a domain that is not theirs.
 *
 * Asserted on the summary never being BUILT, not merely on a rejection: a
 * refusal alone could come from anywhere in the chain, and the thing that must
 * not happen is this conference's numbers being computed for a stranger.
 */
describe('tickets.admin.summary is bound to the request’s conference', () => {
  it('REFUSES an organizer of another tenant', async () => {
    await expect(tickets('org-B').admin.summary()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(h.buildTicketSummary).not.toHaveBeenCalled()
  })

  it('still answers THIS conference’s organizer', async () => {
    await expect(tickets(ORG_A).admin.summary()).resolves.toEqual({
      state: 'ready',
    })
    expect(h.buildTicketSummary).toHaveBeenCalledWith(
      expect.objectContaining({ _id: CONF_A }),
    )
  })

  it('FAILS CLOSED when the conference cannot be resolved', async () => {
    h.getConference.mockResolvedValue({
      conference: null,
      domain: 'localhost',
      error: new Error('sanity down'),
    })
    await expect(tickets().admin.summary()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(h.buildTicketSummary).not.toHaveBeenCalled()
  })
})
