/**
 * @vitest-environment jsdom
 *
 * THE SURFACE THE OWNER ACTUALLY REPORTED: the yellow "usage data unavailable"
 * badge over the discount table. The router test
 * (`server/routers/tickets.discountUsage.test.ts`) pins the payload; this pins
 * what an organizer SEES for each of its states, because the payload could be
 * right while the panel still warns off the wrong field.
 *
 * The three states, and the assertion that distinguishes them:
 *
 *  1. resolved, nothing redeemed yet  → no notice; counts read `0` as OURS.
 *  2. resolved, redemptions found     → no notice; counts read ours.
 *  3. unavailable (ticket read threw) → ONE notice above both tables, plus
 *                                       every count marked with the VENDOR's
 *                                       name because it is the vendor's own
 *                                       redemption counter.
 *
 * Each assertion is on rendered TEXT, not on a missing element alone: the
 * no-notice cases also assert the counts they DO show, so a component that
 * failed to render at all could not pass them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  within,
  fireEvent,
} from '@testing-library/react'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/_app'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'

/**
 * The REAL procedure output, so a fixture cannot drift from what the server
 * sends. Without this the panel could be tested against a payload shape the
 * router can no longer produce and still look green.
 */
type UsagePayload =
  inferRouterOutputs<AppRouter>['tickets']['admin']['getDiscountCodesWithUsage']

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

const q = vi.hoisted(() => ({ useQuery: vi.fn(), invalidate: vi.fn() }))

vi.mock('@/lib/trpc/client', () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false })
  return {
    api: {
      useUtils: () => ({
        tickets: {
          admin: {
            getDiscountCodesWithUsage: { invalidate: q.invalidate },
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

const PROVIDER = 'Checkin.no'
const NOTICE = /could not read this conference's tickets/i
const EXPLANATION = /that read failed/i
/** Names the VENDOR, not a generic "provider" — see the component's prop doc. */
const PROVIDER_HINT = /Checkin\.no count/

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

/**
 * A payload the ROUTER could actually return. Typed against
 * `inferRouterOutputs`, so a field the server ADDS or REMOVES breaks this file
 * at compile time instead of leaving it green against a shape that no longer
 * exists. (It does not catch an explicit `undefined` for an optional-ish
 * field — `Partial` admits that — only add/remove drift.)
 */
function payload(
  over: Pick<UsagePayload, 'usageStatus' | 'discounts'> & Partial<UsagePayload>,
): UsagePayload {
  return {
    success: true,
    ticketTypes: [],
    totalTickets: over.usageStatus === 'resolved' ? 120 : null,
    count: over.discounts.length,
    conferenceInfo: { customerId: 7, eventId: 4242, title: 'Konf 2026' },
    ...over,
  }
}

function renderPanel(data: UsagePayload) {
  q.useQuery.mockReturnValue({ data, isLoading: false, error: null })
  return render(
    <NotificationProvider>
      <DiscountCodeManager
        sponsors={SPONSORS}
        eventId={4242}
        providerLabel={PROVIDER}
        conference={CONFERENCE}
        defaultCustomDiscountsExpanded={true}
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
  it('shows no unavailable notice — the zeros are real', () => {
    renderPanel(
      payload({
        usageStatus: 'resolved',
        ticketTypes: [{ id: 1, name: 'Conference Pass', description: null }],
        discounts: [
          // `times: 7` MATTERS. With `times: 0` this whole test would pass
          // against the un-fixed component too — every assertion would coincide
          // — and it would be pinning the renamed copy rather than the fix. A
          // vendor counter that DISAGREES with our derived zero makes the two
          // implementations render different numbers, so only the fixed one can
          // pass. (See PR: pre-fix this row showed the vendor's 7.)
          promo({
            times: 7,
            actualUsage: { usageCount: 0, ticketIds: [], totalPaid: 0 },
          }),
        ],
      }),
    )

    // The defect verbatim: this used to render the warning.
    expect(screen.queryByText(NOTICE)).toBeNull()
    expect(screen.queryByText(EXPLANATION)).toBeNull()
    // ...and it renders a real, OURS-derived zero rather than nothing at all —
    // NOT the vendor's 7.
    expect(within(promoRow()).getByText('0 / 50')).toBeTruthy()
    expect(within(promoRow()).getByText('0% used')).toBeTruthy()
    expect(within(promoRow()).queryByText(PROVIDER_HINT)).toBeNull()
  })
})

describe('a RESOLVED read with redemptions', () => {
  it('shows our derived counts, unlabelled', () => {
    renderPanel(
      payload({
        usageStatus: 'resolved',
        discounts: [
          promo({
            times: 19,
            actualUsage: { usageCount: 18, ticketIds: [], totalPaid: 0 },
          }),
        ],
      }),
    )

    expect(screen.queryByText(NOTICE)).toBeNull()
    // 18 (ours), not 19 (the provider's) — the panel prefers what it counted.
    expect(within(promoRow()).getByText('18 / 50')).toBeTruthy()
    expect(within(promoRow()).queryByText(PROVIDER_HINT)).toBeNull()
  })
})

describe('an UNAVAILABLE read', () => {
  const unavailable = payload({
    usageStatus: 'unavailable',
    // `actualUsage` OMITTED — the router refuses to invent a zero.
    discounts: [promo({ times: 11 })],
  })

  it('says what went wrong, once, and offers a retry', () => {
    renderPanel(unavailable)

    expect(screen.getByText(EXPLANATION)).toBeTruthy()
    // ONE notice, not one per table — it sits above both because both tables'
    // numbers change source together.
    expect(screen.getAllByText(NOTICE)).toHaveLength(1)
    // Announced, not merely coloured. (Scoped to THIS element: the toast
    // provider also mounts a `role="status"` region, so a bare
    // `getByRole('status')` would pass on the wrong node.)
    const notice = screen.getByText(NOTICE).closest('[role="status"]')
    expect(notice).not.toBeNull()
    // "Reload the page" is not an affordance; the panel can refetch itself —
    // and the button must actually be wired to the refetch, not decorative.
    const retry = within(notice as HTMLElement).getByRole('button', {
      name: /try again/i,
    })
    expect(q.invalidate).not.toHaveBeenCalled()
    fireEvent.click(retry)
    expect(q.invalidate).toHaveBeenCalledTimes(1)
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
    // The cast is the point of the test: `usageStatus` is REQUIRED by the
    // procedure's type, so the only way this payload reaches a browser is a
    // client running against an older deploy. The panel must still refuse to
    // assert a failure it was never told about.
    renderPanel({
      ...payload({ usageStatus: 'resolved', discounts: [promo({ times: 4 })] }),
      usageStatus: undefined,
    } as unknown as UsagePayload)

    expect(screen.queryByText(NOTICE)).toBeNull()
    // It still falls back to the provider counter for the number itself,
    // because `actualUsage` is absent — and still names the source. The label
    // claims only WHOSE number it is, never why: the causal statement ("the
    // ticket read failed") lives in the notice, which fires on a positive
    // status only.
    expect(within(promoRow()).getByText('4 / 50')).toBeTruthy()
    expect(within(promoRow()).getByText(PROVIDER_HINT)).toBeTruthy()
  })
})
