/**
 * @vitest-environment jsdom
 *
 * THE `+` BUTTON THE OWNER TAPPED ON HIS PHONE AND GOT NOTHING FROM.
 *
 * It was not broken; it was correctly disabled, because every sponsor's tier
 * resolved to `ticketEntitlement: 0` (the real cause — a hardcoded
 * title-keyed allocation map that had drifted; see
 * `__tests__/lib/tickets/entitlement.test.ts`). But it said so with
 * `disabled:opacity-50` and nothing else: no `cursor-not-allowed`, no text. On
 * an already-muted grey icon over a dark card that is imperceptible, and on a
 * touch device there is no hover to reveal a `title` tooltip. The control was
 * indistinguishable from a dead div.
 *
 * These tests pin the three things that fix must keep true:
 *
 *  1. entitlement 0 disables the control;
 *  2. the REASON is rendered and programmatically associated with it — the
 *     assertion is on the resolved description TEXT, so a stray
 *     `aria-describedby` pointing at nothing cannot pass;
 *  3. a non-zero entitlement enables it and it actually fires the mutation.
 *
 * Plus the trap that makes (2) subtle: `DataTable` renders every row TWICE —
 * a `md:hidden` mobile card and the desktop table — from the same
 * `column.render`. jsdom applies no CSS, so both are in the document. An id
 * derived from `sponsor.id` would collide and `aria-describedby` would resolve
 * to the first card's text for both. `useId()` is what prevents that, and
 * `each button has its OWN reason element` is the test that would catch its
 * removal.
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

function sponsor(ticketEntitlement: number, tierTitle = 'Gold') {
  return {
    id: 'sponsor-acme',
    name: 'Acme Cloud',
    website: 'https://acme.example',
    tier: {
      title: tierTitle,
      tagline: 'Headline partner',
      tierType: 'standard' as const,
    },
    ticketEntitlement,
  }
}

const EMPTY_PAYLOAD: UsagePayload = {
  success: true,
  discounts: [],
  ticketTypes: [{ id: 1, name: 'Conference Pass', description: null }],
  totalTickets: 120,
  count: 0,
  usageStatus: 'resolved',
  conferenceInfo: { customerId: 7, eventId: 4242, title: 'Konf 2026' },
}

function renderPanel(ticketEntitlement: number, tierTitle?: string) {
  q.useQuery.mockReturnValue({
    data: EMPTY_PAYLOAD,
    isLoading: false,
    error: null,
  })
  return render(
    <NotificationProvider>
      <DiscountCodeManager
        sponsors={[sponsor(ticketEntitlement, tierTitle)]}
        eventId={4242}
        providerLabel="Checkin.no"
        conference={CONFERENCE}
      />
    </NotificationProvider>,
  )
}

/** Both render paths' create buttons, found by accessible name. */
const createButtons = () =>
  screen.getAllByRole('button', {
    name: /create discount code for Acme Cloud/i,
  })

/** The text `aria-describedby` actually resolves to, or null. */
function describedText(button: HTMLElement): string | null {
  const id = button.getAttribute('aria-describedby')
  if (!id) return null
  const target = document.getElementById(id)
  return target ? (target.textContent?.trim() ?? '') : null
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('a sponsor whose tier includes no tickets', () => {
  it('disables the create control in BOTH render paths', () => {
    renderPanel(0)

    const buttons = createButtons()
    // The mobile card AND the desktop table row. A fix applied to one only —
    // the exact shape of the original report — fails here.
    expect(buttons).toHaveLength(2)
    buttons.forEach((button) => {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    })
  })

  it('states the reason, and ties it to the control', () => {
    renderPanel(0)

    createButtons().forEach((button) => {
      // A VALUE, not a presence check: the description must resolve to real
      // text naming the tier. A dangling aria-describedby yields null.
      expect(describedText(button)).toBe('The Gold tier includes no tickets')
    })
  })

  it('names the sponsor’s own tier, not a hardcoded one', () => {
    renderPanel(0, 'Barista Bar Sponsorship')

    expect(describedText(createButtons()[0])).toBe(
      'The Barista Bar Sponsorship tier includes no tickets',
    )
  })

  it('shows the reason as visible text, not only a hover tooltip', () => {
    renderPanel(0)

    // The crux of the report: he was on a phone. `title` is unreachable
    // without a pointer, so the reason must exist as rendered text.
    const visible = screen.getAllByText('The Gold tier includes no tickets')
    expect(visible).toHaveLength(2)
    visible.forEach((el) => expect(el.tagName).not.toBe('BUTTON'))
  })

  it('gives each render path its OWN reason element', () => {
    renderPanel(0)

    const ids = createButtons().map((b) => b.getAttribute('aria-describedby'))
    expect(ids[0]).toBeTruthy()
    // Duplicate ids would make getElementById resolve both buttons to the same
    // node — invalid HTML, and the described text would be the other row's.
    expect(new Set(ids).size).toBe(2)
  })

  it('marks itself not-clickable rather than relying on opacity alone', () => {
    renderPanel(0)

    // `disabled:opacity-50` on a muted grey icon over a dark card is the
    // signal that failed. The house convention pairs it with a cursor.
    expect(createButtons()[0].className).toContain(
      'disabled:cursor-not-allowed',
    )
  })

  it('does not fire the mutation when clicked', () => {
    renderPanel(0)

    fireEvent.click(createButtons()[0])
    expect(q.createMutate).not.toHaveBeenCalled()
  })
})

describe('a sponsor whose tier includes tickets', () => {
  it('enables the create control in both render paths', () => {
    renderPanel(5)

    const buttons = createButtons()
    expect(buttons).toHaveLength(2)
    buttons.forEach((button) => {
      expect((button as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('offers no blocked reason', () => {
    renderPanel(5)

    expect(describedText(createButtons()[0])).toBeNull()
    expect(screen.queryByText(/includes no tickets/i)).toBeNull()
  })

  /**
   * Fails on the ACTION SUCCEEDING with the right value, not on an absence:
   * the entitlement must reach the mutation as `numberOfTickets`, which is the
   * number the discount code is actually worth.
   */
  it('creates a code for exactly the tier’s entitlement', () => {
    renderPanel(5)

    fireEvent.click(createButtons()[0])

    expect(q.createMutate).toHaveBeenCalledTimes(1)
    expect(q.createMutate.mock.calls[0][0]).toMatchObject({
      eventId: 4242,
      numberOfTickets: 5,
      sponsorName: 'Acme Cloud',
      tierTitle: 'Gold',
    })
  })
})
