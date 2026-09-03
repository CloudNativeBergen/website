/**
 * @vitest-environment jsdom
 *
 * WHICH TICKET TYPES A SPONSOR'S 100%-OFF CODE MAY BE SCOPED TO.
 *
 * The "Eligible Ticket Types" dropdown used to list every ticket type on the
 * event, so an organizer could point a sponsor's free code at a full-price
 * public ticket and give away real inventory. It now lists only the
 * sponsor-named types — the same predicate that preselects them — with two
 * escape hatches pinned below: an event with no sponsor-named types keeps the
 * old unrestricted list, and an already-selected type is never hidden.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/_app'

type UsagePayload =
  inferRouterOutputs<AppRouter>['tickets']['admin']['getDiscountCodesWithUsage']

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

const q = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidate: vi.fn(),
  createMutate: vi.fn(),
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
          useMutation: () => ({ mutate: q.createMutate, isPending: false }),
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

const SPONSOR = {
  id: 'sponsor-acme',
  name: 'Acme Cloud',
  website: 'https://acme.example',
  tier: {
    title: 'Gold',
    tagline: 'Headline partner',
    tierType: 'standard' as const,
  },
  ticketEntitlement: 3,
}

function payload(
  ticketTypes: Array<{ id: number; name: string }>,
): UsagePayload {
  return {
    success: true,
    discounts: [],
    ticketTypes: ticketTypes.map((t) => ({ ...t, description: null })),
    totalTickets: 120,
    count: 0,
    usageStatus: 'resolved',
    conferenceInfo: { customerId: 7, eventId: 4242, title: 'Konf 2026' },
  }
}

function renderPanel(ticketTypes: Array<{ id: number; name: string }>) {
  q.useQuery.mockReturnValue({
    data: payload(ticketTypes),
    isLoading: false,
    error: null,
  })
  return render(
    <NotificationProvider>
      <DiscountCodeManager
        sponsors={[SPONSOR]}
        eventId={4242}
        providerLabel="Checkin.no"
        conference={CONFERENCE}
      />
    </NotificationProvider>,
  )
}

/**
 * Opens the sponsor's eligible-ticket-types dropdown and returns its options.
 *
 * `DataTable` renders every row twice (mobile card + desktop table), so the
 * dropdown button exists twice; opening one is enough. Headless UI mounts the
 * options only while the menu is open.
 *
 * Only the checkbox items count as offered types. The menu also carries plain
 * commands ("Apply to all sponsors"), which are not ticket types and must not
 * show up in an assertion about what a code can be scoped to.
 */
function openEligibleTypes(): Array<{ name: string; checked: boolean }> {
  const trigger = screen
    .getAllByRole('button')
    .find(
      (b) =>
        b.querySelector('svg') &&
        /Pass|selected|Ticket|All/i.test(b.textContent ?? ''),
    )
  if (!trigger) throw new Error('eligible ticket types dropdown not found')
  fireEvent.click(trigger)

  return screen
    .getAllByRole('menuitem')
    .filter((item) => item.querySelector('input[type="checkbox"]'))
    .map((item) => ({
      name: item.textContent?.trim() ?? '',
      checked: !!item.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    }))
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('eligible ticket types for a sponsor discount code', () => {
  it('offers ONLY the sponsor ticket types when the event has them', () => {
    renderPanel([
      { id: 1, name: 'Conference Pass' },
      { id: 2, name: 'Sponsor Pass' },
      { id: 3, name: 'Workshop Pass' },
    ])

    const options = openEligibleTypes()

    // A 100%-off code scoped to "Conference Pass" would hand out a full-price
    // seat for free — the type must not even be offered.
    expect(options.map((o) => o.name)).toEqual(['Sponsor Pass'])
    expect(options[0].checked).toBe(true)
  })

  it('falls back to every ticket type when none is sponsor-named', () => {
    renderPanel([
      { id: 1, name: 'Conference Pass' },
      { id: 2, name: 'Workshop Pass' },
    ])

    // A tenant whose types are named differently must still be able to scope
    // a code — an empty dropdown would be worse than an unrestricted one.
    expect(openEligibleTypes().map((o) => o.name)).toEqual([
      'Conference Pass',
      'Workshop Pass',
    ])
  })

  it('keeps an already-selected non-sponsor type listed and checked', () => {
    renderPanel([
      { id: 1, name: 'Conference Pass' },
      { id: 2, name: 'Workshop Pass' },
    ])

    // The preselect falls back to the first type, which is not sponsor-named.
    // Whatever the filter decides, a selected type stays visible: hiding it
    // would silently drop it from the code the organizer then creates.
    expect(openEligibleTypes()).toContainEqual({
      name: 'Conference Pass',
      checked: true,
    })
  })
})
