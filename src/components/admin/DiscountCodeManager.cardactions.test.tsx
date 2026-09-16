/**
 * @vitest-environment jsdom
 *
 * ROW ACTIONS ON A PHONE.
 *
 * The desktop table carries these actions as icons whose meaning lives in a
 * `title`: a touch device never shows a tooltip, so on the mobile card the same
 * actions render as labelled buttons instead, sized for a finger (min-h-11 =
 * 44px, the minimum target).
 *
 * `DataTable` renders every row twice — a `md:hidden` card and the desktop
 * table — and jsdom applies no CSS, so both are in the document. These tests
 * pin the CARD path specifically: its buttons say in text what they do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

const SPONSOR = {
  id: 'sponsor-acme',
  name: 'Acme Cloud',
  website: 'https://acme.example',
  tier: {
    title: 'Gold',
    tagline: 'Headline partner',
    tierType: 'standard' as const,
  },
  ticketEntitlement: 5,
}

/** `ACMECLOUD1234` is how a code is matched back to "Acme Cloud". */
const CODE = 'ACMECLOUD1234'

function payload(withCode: boolean): UsagePayload {
  return {
    success: true,
    discounts: withCode
      ? [
          {
            id: 'd1',
            trigger: 'coupon',
            triggerValue: CODE,
            type: 'percentage',
            value: '100',
            affects: 'total',
            affectsValue: null,
            includeBooking: false,
            modes: [],
            tickets: ['1'],
            ticketsOnly: true,
            timesTotal: 5,
            times: 0,
            actualUsage: { usageCount: 0, ticketIds: [], totalPaid: 0 },
          },
        ]
      : [],
    ticketTypes: [{ id: 1, name: 'Conference Pass', description: null }],
    totalTickets: 120,
    count: withCode ? 1 : 0,
    usageStatus: 'resolved',
    conferenceInfo: { customerId: 7, eventId: 4242, title: 'Konf 2026' },
  }
}

function renderPanel(withCode: boolean) {
  q.useQuery.mockReturnValue({
    data: payload(withCode),
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
        defaultCustomDiscountsExpanded={false}
      />
    </NotificationProvider>,
  )
}

/** A button whose own TEXT says what it does — not an icon with a `title`. */
function labelledButton(text: RegExp) {
  return screen
    .getAllByRole('button')
    .filter((button) => text.test(button.textContent ?? ''))
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('sponsor row actions in the mobile card', () => {
  it('labels create in text, at a 44px target', () => {
    renderPanel(false)

    const buttons = labelledButton(/^\s*Create discount code\s*$/)
    expect(buttons).toHaveLength(1)
    expect(buttons[0].className).toContain('min-h-11')
  })

  it('labels send email and delete in text, at a 44px target', () => {
    renderPanel(true)

    const email = labelledButton(/^\s*Send email\s*$/)
    const remove = labelledButton(/^\s*Delete code\s*$/)
    expect(email).toHaveLength(1)
    expect(remove).toHaveLength(1)
    expect(email[0].className).toContain('min-h-11')
    expect(remove[0].className).toContain('min-h-11')
  })

  it('keeps the code copy control reachable by name, not by hover', () => {
    renderPanel(true)

    // Two render paths, both named — a `title`-only control is unreachable on
    // touch and unnamed to a screen reader.
    expect(
      screen.getAllByRole('button', {
        name: `Copy discount code ${CODE}`,
      }),
    ).toHaveLength(2)
  })
})
