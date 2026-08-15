/**
 * @vitest-environment node
 *
 * "NOBODY HAS REDEEMED IT YET" IS NOT "WE COULD NOT LOOK".
 *
 * `getDiscountCodesWithUsage` used to report `hasUsageData:
 * Object.keys(usageStats).length > 0`, and `calculateDiscountUsage` only ever
 * mints a key for a code that has ACTUALLY been redeemed. A conference with
 * live codes and no redemptions therefore produced `{}` — byte-identical to
 * the output of a ticket read that threw and was swallowed by the `catch`. The
 * organizer got a yellow "usage data unavailable" badge over data that was
 * perfectly available and simply zero.
 *
 * This is the empty-vs-unknown class `src/lib/conference/guard.ts` already
 * names for Host resolution, so the fix reuses that vocabulary rather than
 * inventing a fourth shape: `usageStatus: 'resolved' | 'unavailable'`.
 * (`not-found` has no analogue here — an event whose ticket list comes back
 * empty is a STATEMENT about the world, i.e. `resolved` with every count at
 * zero. See `src/lib/discounts/types.ts`.)
 *
 * THE DECISIVE PAIR is the first two tests below. They differ in exactly one
 * thing — whether `fetchEventTickets` resolves or rejects — and they must
 * disagree about `usageStatus`. Against the pre-fix logic the ZERO-REDEMPTION
 * test fails (it reported unavailable) while the FAILED-READ test passes, which
 * is precisely the defect: one of the two states was unobservable.
 *
 * Everything below the pair is asserted on VALUES (a status string, the
 * presence or absence of `actualUsage`, a count), never on an absence, and the
 * caller is a genuine organizer of the request org so no unrelated guard can
 * produce the same output.
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
  fetchEventTickets: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: vi.fn(), patch: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingCredentials: h.resolveCredentials,
  getTicketingProvider: () => ({
    listDiscounts: h.listDiscounts,
    fetchEventTickets: h.fetchEventTickets,
  }),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { ticketsRouter } from './tickets'

const t = initTRPC.context<Context>().create()

const ORG = 'organization-cloud-native-days'
const CONF = 'conf-cndn'
const EVENT = 4242
const CUSTOMER = 7

/** Two live codes. Neither has to have been redeemed for them to be real. */
const DISCOUNTS = [
  {
    id: 'd1',
    trigger: 'coupon',
    type: 'percentage',
    value: '100',
    triggerValue: 'ACME2026',
    affects: 'total',
    includeBooking: false,
    affectsValue: null,
    modes: [],
    tickets: [],
    ticketsOnly: true,
    /** Checkin's OWN redemption counter, returned by `listDiscounts`. */
    times: 3,
    timesTotal: 10,
  },
  {
    id: 'd2',
    trigger: 'coupon',
    type: 'percentage',
    value: '50',
    triggerValue: 'EARLYBIRD',
    affects: 'total',
    includeBooking: false,
    affectsValue: null,
    modes: [],
    tickets: [],
    ticketsOnly: true,
    times: 0,
    timesTotal: 5,
  },
]

const ticket = (id: number, coupon?: string) => ({
  id,
  order_id: 500 + id,
  category: 'Regular',
  customer_name: null,
  sum: '1000.50',
  sum_left: '0',
  coupon,
  fields: [],
  crm: { first_name: 'A', last_name: 'B', email: `a${id}@example.com` },
  order_date: '2026-06-01',
})

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

beforeEach(() => {
  vi.clearAllMocks()
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
    status: 'resolved',
  })
  h.getOrganizationById.mockResolvedValue({
    _id: ORG,
    name: 'Cloud Native Days Norway',
    slug: 'cloud-native-days-norway',
  })
  h.resolveCredentials.mockResolvedValue({ apiKey: 'k', apiSecret: 's' })
  h.listDiscounts.mockResolvedValue({
    discounts: DISCOUNTS,
    ticketTypes: [{ id: 1, name: 'Conference', description: null }],
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('THE DECISIVE PAIR: zero redemptions vs an unreadable ticket list', () => {
  it('a SUCCESSFUL read with zero redemptions is resolved — not unavailable', async () => {
    // Real tickets exist; none of them carries a discount code. This is the
    // shape every conference has between opening its codes and the first
    // redemption, and it is the one the old boolean could not express.
    h.fetchEventTickets.mockResolvedValue([ticket(1), ticket(2)])

    const result = await tickets().admin.getDiscountCodesWithUsage()

    expect(result.usageStatus).toBe('resolved')
    // A known zero, stated: `actualUsage` is PRESENT and reads zero.
    for (const discount of result.discounts) {
      expect(discount.actualUsage).toEqual({
        usageCount: 0,
        ticketIds: [],
        totalPaid: 0,
      })
    }
    // The ticket list itself was read, and its size is a fact we hold.
    expect(result.totalTickets).toBe(2)
  })

  it('a FAILED read is unavailable, and states no usage at all', async () => {
    h.fetchEventTickets.mockRejectedValue(new Error('checkin 503'))

    const result = await tickets().admin.getDiscountCodesWithUsage()

    expect(result.usageStatus).toBe('unavailable')
    // No fabricated zero: absent means unknown. A `{usageCount: 0}` here would
    // be the router asserting nobody redeemed a code it never managed to check.
    for (const discount of result.discounts) {
      expect(discount.actualUsage).toBeUndefined()
    }
    expect(result.totalTickets).toBeNull()
  })

  it('the two states are distinguishable — the pair disagrees', async () => {
    h.fetchEventTickets.mockResolvedValue([ticket(1)])
    const ok = await tickets().admin.getDiscountCodesWithUsage()
    h.fetchEventTickets.mockRejectedValue(new Error('checkin 503'))
    const bad = await tickets().admin.getDiscountCodesWithUsage()

    expect(ok.usageStatus).not.toBe(bad.usageStatus)
  })
})

describe('a resolved read reports the usage it actually found', () => {
  it('counts redemptions per code, case-insensitively', async () => {
    h.fetchEventTickets.mockResolvedValue([
      ticket(1, 'acme2026'),
      ticket(2, 'ACME2026'),
      ticket(3),
    ])

    const result = await tickets().admin.getDiscountCodesWithUsage()

    expect(result.usageStatus).toBe('resolved')
    const acme = result.discounts.find((d) => d.triggerValue === 'ACME2026')
    expect(acme?.actualUsage).toEqual({
      usageCount: 2,
      ticketIds: [1, 2],
      totalPaid: 2001,
    })
    // The unredeemed code sits next to it as a KNOWN zero, in the same payload.
    const early = result.discounts.find((d) => d.triggerValue === 'EARLYBIRD')
    expect(early?.actualUsage?.usageCount).toBe(0)
    expect(result.totalTickets).toBe(3)
  })

  it('does not confuse our derived count with the provider’s own counter', async () => {
    // `times: 3` on ACME2026 is Checkin's counter. Our scan of the current
    // ticket list finds one. Both numbers ship; neither overwrites the other.
    h.fetchEventTickets.mockResolvedValue([ticket(1, 'ACME2026')])

    const result = await tickets().admin.getDiscountCodesWithUsage()

    const acme = result.discounts.find((d) => d.triggerValue === 'ACME2026')
    expect(acme?.times).toBe(3)
    expect(acme?.actualUsage?.usageCount).toBe(1)
  })
})

describe('the ticket read is the ONLY thing the status describes', () => {
  it('a failed DISCOUNT read is an error, never a zero-usage payload', async () => {
    // Distinct from an unreadable ticket list: without the discounts there is
    // nothing to report usage ON, so this must throw rather than return an
    // empty table under an "unavailable" badge.
    h.listDiscounts.mockRejectedValue(new Error('checkin 500'))

    await expect(
      tickets().admin.getDiscountCodesWithUsage(),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch discount codes with usage',
    })
    expect(h.fetchEventTickets).not.toHaveBeenCalled()
  })

  it('an event with no codes at all is still a resolved read', async () => {
    h.listDiscounts.mockResolvedValue({ discounts: [], ticketTypes: [] })
    h.fetchEventTickets.mockResolvedValue([])

    const result = await tickets().admin.getDiscountCodesWithUsage()

    expect(result.usageStatus).toBe('resolved')
    expect(result.discounts).toEqual([])
    expect(result.totalTickets).toBe(0)
  })
})
