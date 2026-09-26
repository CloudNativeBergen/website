/**
 * @vitest-environment jsdom
 *
 * THE PAGE RENDERS. IT DOES NOT COMPUTE.
 *
 * Every figure on `/admin/tickets` used to be derived inside the Server
 * Component, so a second consumer — the CLI, a widget, an MCP tool — had to
 * reimplement the arithmetic. That is the drift six PRs went into removing from
 * the budget actuals and the weekly Slack post. The numbers now come from
 * `buildTicketSummary`, which `tickets.admin.summary` serves unchanged.
 *
 * So this suite does two jobs.
 *
 *  1. It PINS the whole rendered page. The snapshot below was captured against
 *     the calculating page and matched byte for byte afterwards: this is a
 *     refactor, and a number that moves fails here rather than in production.
 *  2. It asserts the page renders the summary's OWN values. A reintroduced
 *     local calculation shows up as a mismatch instead of as a second number
 *     nobody compares.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('react-apexcharts', () => ({
  __esModule: true,
  default: () => <div data-testid="chart" />,
}))
// A tRPC-backed form, and not what is under test here.
vi.mock('@/components/admin/TargetConfigEditor', () => ({
  TargetConfigEditor: () => <div data-testid="target-editor" />,
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  resolveAccess: vi.fn(),
  getSpeakers: vi.fn(),
  getOrganizerCount: vi.fn(),
  fetchSpeakerTicketInputs: vi.fn(),
  resolveSpeakerTicketType: vi.fn(),
  fetchEventTickets: vi.fn(),
  listDiscounts: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: h.getSpeakers,
  getOrganizerCount: h.getOrganizerCount,
}))
vi.mock('@/lib/speaker/ticketInputs', () => ({
  fetchSpeakerTicketInputs: h.fetchSpeakerTicketInputs,
}))
vi.mock('@/lib/tickets/admin-access', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveTicketingAdminAccess: h.resolveAccess,
}))
vi.mock('@/lib/tickets/speakerStatus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveSpeakerTicketType: h.resolveSpeakerTicketType,
}))
// SPIED, NOT STUBBED: the page must render the REAL summary's numbers, and the
// spy exists only so the divergence test can compare against them.
vi.mock('@/lib/tickets/summary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tickets/summary')>()
  return { ...actual, buildTicketSummary: vi.fn(actual.buildTicketSummary) }
})

import AdminTickets from './page'
import { buildTicketSummary } from '@/lib/tickets/summary'
import type { EventTicket } from '@/lib/tickets/types'

afterEach(cleanup)

const crm = (email: string) => ({
  first_name: 'A',
  last_name: 'B',
  email,
})

const CONFERENCE = {
  _id: 'conf-1',
  title: 'Test Conf',
  organization: { _ref: 'org-A' },
  startDate: '2026-06-01',
  ticketCapacity: 100,
  ticketTargets: {
    enabled: true,
    salesStartDate: '2026-01-01',
    targetCurve: 'linear' as const,
    milestones: [],
  },
  // ONLY the upgrade is declared, so the tally's `roleBasis` is exercised
  // rather than assumed away.
  ticketTypeRoles: [{ typeName: 'Workshop upgrade', admits: false }],
  sponsors: [
    {
      sponsor: { name: 'Acme' },
      tier: { title: 'Gold', ticketEntitlement: 2 },
    },
  ],
}

const ticket = (t: Partial<EventTicket> & { id: number; order_id: number }) =>
  ({
    order_date: '2026-02-01T10:00:00Z',
    category: 'Regular',
    customer_name: null,
    sum: '0',
    sum_left: '0',
    fields: [],
    crm: crm('x@example.com'),
    ...t,
  }) as EventTicket

const TICKETS: EventTicket[] = [
  ticket({ id: 1, order_id: 100, sum: '2500', crm: crm('a@example.com') }),
  ticket({ id: 2, order_id: 101, sum: '2500', crm: crm('b@example.com') }),
  // Invitation-gated: a grant, whatever it cost.
  ticket({
    id: 3,
    order_id: 102,
    category: 'Speaker ticket',
    crm: crm('speaker@example.com'),
  }),
  // A 100%-off sponsor code: a comp by GRANT, not by price.
  ticket({
    id: 4,
    order_id: 103,
    coupon: 'ACME100',
    crm: crm('sponsored@example.com'),
  }),
  // An add-on, on the same order and the same address as ticket 1.
  ticket({
    id: 5,
    order_id: 100,
    category: 'Workshop upgrade',
    sum: '500',
    crm: crm('a@example.com'),
  }),
]

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: CONFERENCE,
    domain: 'localhost',
    error: null,
  })
  h.fetchEventTickets.mockResolvedValue(TICKETS)
  h.listDiscounts.mockResolvedValue({
    discounts: [
      {
        id: 1,
        triggerValue: 'ACME100',
        type: 'percent',
        value: '100',
        tickets: [],
      },
    ],
    ticketTypes: [{ id: 10, name: 'Regular' }],
  })
  h.resolveAccess.mockResolvedValue({
    state: 'ready',
    providerType: 'checkin',
    eventRef: { provider: 'checkin', customerId: 7, eventId: 4242 },
    provider: {
      amountsIncludeVat: false,
      amountBasis: 'per-order',
      fetchEventTickets: h.fetchEventTickets,
      listDiscounts: h.listDiscounts,
    },
  })
  h.resolveSpeakerTicketType.mockResolvedValue({
    id: 11,
    name: 'Speaker ticket',
  })
  h.getSpeakers.mockResolvedValue({
    speakers: [{ _id: 'sp-1' }, { _id: 'sp-2' }],
    err: null,
  })
  h.getOrganizerCount.mockResolvedValue({ count: 3, err: null })
  h.fetchSpeakerTicketInputs.mockResolvedValue([
    {
      speakerId: 'sp-1',
      emails: ['speaker@example.com'],
      invitedAt: '2026-01-05',
    },
    { speakerId: 'sp-2', emails: ['other@example.com'], invitedAt: null },
  ])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** The visible prose, with the non-breaking spaces currency formatting uses. */
const pageText = () =>
  (document.body.textContent ?? '').replace(/ /g, ' ').trim()

/** A stat card labels its value; read the whole card. */
const card = (title: string) => screen.getByText(title).closest('div')

/** The desktop table row. `DataTable` also renders a mobile card per row. */
const row = (label: string) =>
  screen
    .getAllByText(label)
    .map((el) => el.closest('tr'))
    .find(Boolean) as HTMLElement

describe('the rendered page', () => {
  beforeEach(async () => {
    render(await AdminTickets())
  })

  /**
   * CAPTURED BEFORE THE MOVE, against the page that did its own arithmetic.
   * Every figure here is load-bearing: participants deduped once (4 humans, not
   * 5 tickets), the paid/free split by grant (3 sellable, the 100%-off
   * redemption and the speaker ticket free), revenue over the paid three, and
   * the free-ticket total that names what it covers.
   */
  it('renders the same figures as before the summary moved out', () => {
    expect(pageText()).toMatchInlineSnapshot(
      `"Ticket ManagementManage sold tickets and attendee information for Test ConfPage ContentTicket TypesOrdersDiscountsInvitation LettersUnique Participants≈ 4Ticket types with no role count as seats — set roles on Ticket TypesWorkshop Participants≈ 1Participants holding a workshop ticketFree Tickets Claimed2 / 450.0% claimed · sponsors and speakers onlySellable Tickets Sold3 / 1003.0% of tickets for sale (comps excluded)Seats Used≈ 4Admitting tickets, comps includedTarget Progress3.0%Behind (-97.0%)Revenue5 500 kr1 833 kr per ticket · ex. VATTicket Sales by CategoryPaid tickets only, like the cards above.Paid Tickets Only3 paid tickets Include free tickets in analysisToggle to include speaker tickets and other complimentary tickets in charts and statisticsPaid tickets only, like the cards above. Cumulative ticket sales by type, to date: Regular: 2, Workshop upgrade: 1. Sales target for the period: 100. Tickets for sale: 100.Free Ticket Allocation & UsageHideSponsorsAllocated2Claimed1StatusRedemptions of 100%-off sponsor codes.Confirmed SpeakersAllocated2Claimed1Status0 invitations unclaimed · 1 speaker never invited.OrganizersAllocated3ClaimedUnknownStatusOrganizer comps cannot be told apart from any other free ticket.CategoryAllocatedClaimedStatusSponsors21Redemptions of 100%-off sponsor codes.Confirmed Speakers210 invitations unclaimed · 1 speaker never invited.Organizers3UnknownOrganizer comps cannot be told apart from any other free ticket.Total72 of 4 claimed (50.0%) · sponsors and speakers onlyNote: Free tickets are allocated to sponsors from each tier's complimentary ticket count, one per confirmed speaker, and one per organizer. Set a tier's allowance under Sponsor Tiers; a tier with none contributes nothing here. Each category is claimed differently, so each is counted from its own source: sponsor comps are redemptions of a sponsor's 100%-off discount code, speaker comps are invitation-gated speaker tickets, and an organizer comp cannot be told apart from any other free ticket — so it is reported as unknown rather than as zero.Breakdown by Ticket TypeShowSponsor Ticket AllocationsShow"`,
    )
  })

  it('reports the organizer claims as unknown, never as zero', () => {
    // The one number nobody can obtain: an organizer comp is indistinguishable
    // from any other free ticket. A 0 here would send someone chasing three
    // organizers who already hold their seats.
    expect(within(row('Organizers')).getByText('Unknown')).toBeVisible()
    expect(within(row('Sponsors')).queryByText('Unknown')).toBeNull()
  })

  it('qualifies a headcount that rests on undeclared ticket types', () => {
    // `roleBasis` reaching the surface: only the upgrade is declared, so the
    // count is prefixed and says what to do about it.
    expect(card('Unique Participants')?.textContent).toContain('≈ 4')
    expect(pageText()).toContain('Ticket types with no role count as seats')
  })
})

describe('the page and the procedure cannot diverge', () => {
  it('renders the figures the summary returned, not its own', async () => {
    render(await AdminTickets())

    expect(buildTicketSummary).toHaveBeenCalledTimes(1)
    const summary = await vi.mocked(buildTicketSummary).mock.results[0].value
    if (summary.state !== 'ready') throw new Error('fixture is not ready')

    expect(card('Unique Participants')?.textContent).toContain(
      String(summary.participants.participants),
    )
    expect(card('Seats Used')?.textContent).toContain(String(summary.seatsUsed))
    expect(card('Sellable Tickets Sold')?.textContent).toContain(
      `${summary.ticketCounts.paid} / ${summary.capacity}`,
    )
    expect(
      within(row('Sponsors')).getByText(
        String(summary.freeTicketAllocation.sponsors.claimed),
      ),
    ).toBeVisible()
  })

  /**
   * THE STRUCTURAL HALF. The assertion above only compares the values the page
   * happens to render; this one refuses the page the TOOLS to compute a new
   * one. Reintroducing any calculator import here fails immediately, before
   * anyone has to notice two numbers drifting apart.
   */
  it('imports no calculator of its own', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(admin)/admin/tickets/page.tsx'),
      'utf-8',
    )
    for (const forbidden of [
      '@/lib/tickets/utils',
      '@/lib/tickets/classification',
      '@/lib/tickets/classificationContext',
      '@/lib/tickets/freeAllocation',
      '@/lib/tickets/participants',
      '@/lib/tickets/processor',
      '@/lib/tickets/speakerStatus',
      '@/lib/tickets/admin-access',
      '@/lib/speaker/sanity',
      '@/lib/speaker/ticketInputs',
      '@/lib/discounts',
    ]) {
      expect(source).not.toContain(`from '${forbidden}'`)
    }
  })
})
