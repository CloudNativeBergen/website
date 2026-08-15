/**
 * @vitest-environment jsdom
 *
 * THE SURFACE THE OWNER ACTUALLY REPORTED: the yellow badge over the discount
 * table. The router test (`server/routers/tickets.discountUsage.test.ts`) pins
 * the payload; this pins what an organizer SEES for each of its states, because
 * the payload could be right while the panel still renders the badge off the
 * wrong field.
 *
 * The three states, and the assertion that distinguishes them:
 *
 *  1. resolved, nothing redeemed yet  → no badge; counts read `0` as OURS.
 *  2. resolved, redemptions found     → no badge; counts read ours.
 *  3. unavailable (ticket read threw) → badge + an explanation, and every count
 *                                       marked as the provider's own counter.
 *
 * Each assertion is on rendered TEXT, not on a missing element alone: the
 * no-badge cases also assert the counts they DO show, so a component that
 * failed to render at all could not pass them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'

// The ticket-type filter dropdown and the row ActionMenu both observe
// intersections to decide which way to open; jsdom has no IntersectionObserver.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  },
)

const q = vi.hoisted(() => ({ useQuery: vi.fn() }))

vi.mock('@/lib/trpc/client', () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false })
  return {
    api: {
      useUtils: () => ({
        tickets: {
          admin: {
            getDiscountCodesWithUsage: { invalidate: vi.fn() },
          },
        },
      }),
      tickets: {
        admin: {
          getDiscountCodesWithUsage: { useQuery: q.useQuery },
          createDiscountCode: { useMutation: mutation },
          deleteDiscountCode: { useMutation: mutation },
        },
      },
    },
  }
})

import { DiscountCodeManager } from './DiscountCodeManager'
import { NotificationProvider } from './NotificationProvider'

const SPONSORS = [
  {
    id: 'sponsor-acme',
    name: 'Acme Cloud',
    website: 'https://acme.example',
    tier: {
      title: 'Gold',
      tagline: 'Headline partner',
      tierType: 'standard' as const,
    },
    ticketEntitlement: 5,
  },
]

const CONFERENCE = {
  title: 'Konf 2026',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-09-10',
  domains: ['konf.example'],
  contactEmail: 'organizers@konf.example',
  domain: 'konf.example',
}

const BADGE = /could not read tickets/i
const EXPLANATION = /couldn't read this event's tickets/i
const PROVIDER_HINT = /provider count/i

/** A general (non-sponsor) promotion — it lands in the Custom Discount table. */
function promo(
  overrides: Partial<EventDiscountWithUsage> = {},
): EventDiscountWithUsage {
  return {
    id: 'd1',
    trigger: 'coupon',
    type: 'percentage',
    value: '20',
    triggerValue: 'EARLYBIRD',
    affects: 'total',
    includeBooking: false,
    affectsValue: null,
    modes: [],
    tickets: [],
    ticketsOnly: true,
    times: 0,
    timesTotal: 50,
    ...overrides,
  }
}

function renderPanel(data: unknown) {
  q.useQuery.mockReturnValue({ data, isLoading: false, error: null })
  return render(
    <NotificationProvider>
      <DiscountCodeManager
        sponsors={SPONSORS}
        eventId={4242}
        conference={CONFERENCE}
      />
    </NotificationProvider>,
  )
}

/**
 * The DESKTOP table row for a code.
 *
 * `DataTable` renders every row twice — a `md:hidden` mobile card and the
 * table — from the SAME `column.render`, so each label appears twice in jsdom
 * (CSS hiding is not applied). Scoping to the `<tr>` picks one deterministically
 * and keeps `getByText` unambiguous; the card cannot diverge because it is the
 * same function.
 */
function rowFor(code: string): HTMLElement {
  const row = screen
    .getAllByText(code)
    .map((el) => el.closest('tr'))
    .find((el): el is HTMLTableRowElement => el !== null)
  if (!row) throw new Error(`no table row rendered for ${code}`)
  return row
}

const promoRow = () => rowFor('EARLYBIRD')

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('a RESOLVED read with nothing redeemed yet', () => {
  it('shows no unavailable badge — the zeros are real', () => {
    renderPanel({
      success: true,
      usageStatus: 'resolved',
      totalTickets: 120,
      discounts: [
        promo({ actualUsage: { usageCount: 0, ticketIds: [], totalPaid: 0 } }),
      ],
      ticketTypes: [{ id: 1, name: 'Conference Pass', description: null }],
      count: 1,
    })

    // The defect verbatim: this used to render the badge.
    expect(screen.queryByText(BADGE)).toBeNull()
    expect(screen.queryByText(EXPLANATION)).toBeNull()
    // ...and it renders a real, OURS-derived zero rather than nothing at all.
    expect(within(promoRow()).getByText('0 / 50')).toBeTruthy()
    expect(within(promoRow()).getByText(/0% used/)).toBeTruthy()
    expect(within(promoRow()).queryByText(PROVIDER_HINT)).toBeNull()
  })
})

describe('a RESOLVED read with redemptions', () => {
  it('shows our derived counts, unlabelled', () => {
    renderPanel({
      success: true,
      usageStatus: 'resolved',
      totalTickets: 120,
      discounts: [
        promo({
          times: 19,
          actualUsage: { usageCount: 18, ticketIds: [], totalPaid: 0 },
        }),
      ],
      ticketTypes: [],
      count: 1,
    })

    expect(screen.queryByText(BADGE)).toBeNull()
    // 18 (ours), not 19 (the provider's) — the panel prefers what it counted.
    expect(within(promoRow()).getByText('18 / 50')).toBeTruthy()
    expect(within(promoRow()).queryByText(PROVIDER_HINT)).toBeNull()
  })
})

describe('an UNAVAILABLE read', () => {
  const unavailable = {
    success: true,
    usageStatus: 'unavailable' as const,
    totalTickets: null,
    // `actualUsage` OMITTED — the router refuses to invent a zero.
    discounts: [promo({ times: 11 })],
    ticketTypes: [],
    count: 1,
  }

  it('badges it AND says what went wrong', () => {
    renderPanel(unavailable)

    expect(screen.getByText(BADGE)).toBeTruthy()
    expect(screen.getByText(EXPLANATION)).toBeTruthy()
  })

  it('shows the provider’s own counter and names it as such', () => {
    renderPanel(unavailable)

    const row = promoRow()
    expect(within(row).getByText('11 / 50')).toBeTruthy()
    expect(within(row).getByText(PROVIDER_HINT)).toBeTruthy()
    // The word the fallback must NOT carry: `times` is the vendor's first-party
    // redemption counter, not something we approximated.
    expect(within(row).queryByText(/estimated/i)).toBeNull()
  })

  it('marks the sponsor tier count from the provider too', () => {
    renderPanel({
      ...unavailable,
      discounts: [
        promo(),
        promo({
          id: 'd2',
          triggerValue: 'ACMECLOUD1234',
          value: '100',
          times: 2,
          timesTotal: 5,
        }),
      ],
    })

    const sponsorRow = rowFor('Acme Cloud')
    expect(within(sponsorRow).getByText('2')).toBeTruthy()
    expect(within(sponsorRow).getByText(PROVIDER_HINT)).toBeTruthy()
  })
})

describe('a payload with no status at all asserts nothing', () => {
  it('does not badge an older/absent usageStatus', () => {
    // Only a POSITIVE 'unavailable' raises the badge — the same rule
    // `isConferenceUnavailable` follows for an absent resolution status.
    renderPanel({
      success: true,
      totalTickets: 120,
      discounts: [promo({ times: 4 })],
      ticketTypes: [],
      count: 1,
    })

    expect(screen.queryByText(BADGE)).toBeNull()
    // It still falls back to the provider counter for the number itself,
    // because `actualUsage` is absent — and still names the source.
    expect(within(promoRow()).getByText('4 / 50')).toBeTruthy()
    expect(within(promoRow()).getByText(PROVIDER_HINT)).toBeTruthy()
  })
})
