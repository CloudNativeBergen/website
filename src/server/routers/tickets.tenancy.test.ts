/**
 * @vitest-environment node
 *
 * TENANCY FOR PROVIDER IDS (#731 F5).
 *
 * `checkin()` is constructed from ONE process-wide `CHECKIN_API_KEY` /
 * `CHECKIN_API_SECRET` pair shared by every tenant. Four `tickets.admin.*`
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
  platformCheckinCredentials: () => ({ apiKey: 'k', apiSecret: 's' }),
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
import { ticketsRouter } from './tickets'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'
/** The event id THIS conference owns. */
const OUR_EVENT = 4242
/** Another tenant's event on the same shared Checkin account. */
const THEIR_EVENT = 4243

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
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

beforeEach(() => {
  vi.clearAllMocks()
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
})
