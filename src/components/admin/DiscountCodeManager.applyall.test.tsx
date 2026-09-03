/**
 * @vitest-environment jsdom
 *
 * SETTING ELIGIBLE TICKET TYPES ONCE INSTEAD OF ONCE PER SPONSOR.
 *
 * Every sponsor on the discount page normally gets the same eligible ticket
 * types, so picking them row by row is pure repetition. "Apply to all
 * sponsors" copies one row's selection onto every other row that still awaits
 * a choice.
 *
 * The second test is the one that makes the first one worth anything: the
 * seeding effect reruns whenever the query hands back new array identities
 * (the Refresh button does exactly that), and a version that re-seeds
 * unconditionally would wipe the selection the organizer just applied to
 * twenty rows without saying a word.
 *
 * As in the entitlement suite, `DataTable` renders each row twice — mobile
 * card and desktop table — so every per-row count below is doubled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/_app'

type UsagePayload =
  inferRouterOutputs<AppRouter>['tickets']['admin']['getDiscountCodesWithUsage']

const q = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      tickets: {
        admin: { getDiscountCodesWithUsage: { invalidate: q.invalidate } },
      },
    }),
    tickets: {
      admin: {
        getDiscountCodesWithUsage: { useQuery: q.useQuery },
        createDiscountCode: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        deleteDiscountCode: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
    },
  },
}))

import { DiscountCodeManager } from './DiscountCodeManager'
import { NotificationProvider } from './NotificationProvider'

const CONFERENCE = {
  title: 'Konf 2026',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-09-10',
  domains: ['konf.example'],
  contactEmail: 'organizers@konf.example',
  domain: 'konf.example',
}

const SPONSORS = ['Acme Cloud', 'Bergen Bytes', 'Cirrus Systems'].map(
  (name, index) => ({
    id: `sponsor-${index}`,
    name,
    website: `https://${index}.example`,
    tier: {
      title: 'Community Partner Package',
      tagline: 'Partner',
      tierType: 'standard' as const,
    },
    ticketEntitlement: 2,
  }),
)

/** A fresh object every call — a refetch never returns the same identity. */
const payload = (): UsagePayload => ({
  success: true,
  discounts: [],
  ticketTypes: [
    { id: 1, name: 'Conference Pass', description: null },
    { id: 2, name: 'Workshop Upgrade', description: null },
  ],
  totalTickets: 120,
  count: 0,
  usageStatus: 'resolved',
  conferenceInfo: { customerId: 7, eventId: 4242, title: 'Konf 2026' },
})

function renderPanel() {
  q.useQuery.mockReturnValue({
    data: payload(),
    isLoading: false,
    error: null,
  })
  return render(
    <NotificationProvider>
      <DiscountCodeManager
        sponsors={SPONSORS}
        eventId={4242}
        providerLabel="Checkin.no"
        conference={CONFERENCE}
      />
    </NotificationProvider>,
  )
}

/**
 * Row dropdown triggers, whose accessible name is the current selection
 * summary followed by the count badge (both live inside the button's label).
 * The open menu's own options are buttons too, hence the haspopup filter.
 */
const triggers = (label: RegExp) =>
  screen
    .queryAllByRole('button', { name: label })
    .filter((b) => b.getAttribute('aria-haspopup') === 'menu')

const BOTH = /^Conference Pass, Workshop Upgrade\s*2$/
const ONE_ONLY = /^Conference Pass\s*1$/

function selectBothOnFirstRow() {
  fireEvent.click(triggers(ONE_ONLY)[0])
  fireEvent.click(screen.getByRole('menuitem', { name: 'Workshop Upgrade' }))
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('applying one row’s ticket types to every sponsor', () => {
  it('starts every row on the same seeded single type', () => {
    renderPanel()

    // 3 sponsors × mobile card + desktop row.
    expect(triggers(ONE_ONLY)).toHaveLength(6)
    expect(triggers(BOTH)).toHaveLength(0)
  })

  it('changes only the edited row until the action is used', () => {
    renderPanel()

    selectBothOnFirstRow()
    // Headless UI hides the rest of the table from the accessibility tree
    // while a menu is open, so the other rows are only queryable once closed.
    fireEvent.click(triggers(BOTH)[0])

    expect(triggers(BOTH)).toHaveLength(2)
    expect(triggers(ONE_ONLY)).toHaveLength(4)
  })

  it('copies that row’s selection onto every other row', () => {
    renderPanel()

    selectBothOnFirstRow()
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Apply to all sponsors' }),
    )

    expect(triggers(BOTH)).toHaveLength(6)
    expect(triggers(ONE_ONLY)).toHaveLength(0)
  })
})

describe('a refetch while selections are in flight', () => {
  it('keeps them instead of re-seeding over the top', () => {
    const { rerender } = renderPanel()

    selectBothOnFirstRow()
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Apply to all sponsors' }),
    )

    // What the Refresh button does: same data, new object identities.
    q.useQuery.mockReturnValue({
      data: payload(),
      isLoading: false,
      error: null,
    })
    rerender(
      <NotificationProvider>
        <DiscountCodeManager
          sponsors={SPONSORS}
          eventId={4242}
          providerLabel="Checkin.no"
          conference={CONFERENCE}
        />
      </NotificationProvider>,
    )

    expect(triggers(BOTH)).toHaveLength(6)
  })

  it('drops a ticket type the provider has stopped offering', () => {
    const { rerender } = renderPanel()

    selectBothOnFirstRow()
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Apply to all sponsors' }),
    )

    // The workshop upgrade is deleted upstream. Keeping it would leave every
    // row reading "Unknown" and would send a dead id to the provider when the
    // code is created.
    const withoutWorkshop = payload()
    withoutWorkshop.ticketTypes = withoutWorkshop.ticketTypes.filter(
      (t) => t.id !== 2,
    )
    q.useQuery.mockReturnValue({
      data: withoutWorkshop,
      isLoading: false,
      error: null,
    })
    rerender(
      <NotificationProvider>
        <DiscountCodeManager
          sponsors={SPONSORS}
          eventId={4242}
          providerLabel="Checkin.no"
          conference={CONFERENCE}
        />
      </NotificationProvider>,
    )

    expect(triggers(ONE_ONLY)).toHaveLength(6)
    expect(screen.queryByText('Unknown')).toBeNull()
  })
})
