/**
 * @vitest-environment jsdom
 *
 * STANDALONE DISCOUNT CODES — a code with no sponsor attached.
 *
 * Before this, the panel could only issue a code to a sponsor: the tRPC input
 * required `sponsorName`, and every create ran off a sponsor row. A community
 * or partner code had to be made in the vendor's own admin, after which it
 * appeared here in a second table called "Custom Discount Codes" that could
 * only list and delete.
 *
 * Two properties are pinned here, and they are the ones that can break:
 *
 *  1. The create form issues a code with NO sponsor, at a rate the organizer
 *     chose — asserted on the mutation arguments, not on the form clearing.
 *  2. ONE listing holds both kinds. Sponsor codes are no longer hidden from
 *     the code table; each row says what it is for.
 *
 * The sponsor path staying identical is pinned server-side in
 * `server/routers/tickets.tenancy.test.ts` (which sees the provider arguments)
 * and here by `DiscountCodeManager.entitlement.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
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
  deleteMutate: vi.fn(),
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
          useMutation: () => ({ mutate: q.deleteMutate, isPending: false }),
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

/** `ACMECLOUD1234` is the string that matches this code back to "Acme Cloud". */
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

const discount = (triggerValue: string, value: string) => ({
  id: triggerValue,
  trigger: 'coupon',
  triggerValue,
  type: 'percentage',
  value,
  affects: 'total',
  affectsValue: null,
  includeBooking: false,
  modes: [],
  tickets: ['1'],
  ticketsOnly: true,
  timesTotal: 10,
  times: 0,
  actualUsage: { usageCount: 3, ticketIds: [1, 2, 3], totalPaid: 900 },
})

const PAYLOAD: UsagePayload = {
  success: true,
  discounts: [
    discount('ACMECLOUD1234', '100'),
    discount('COMMUNITY2026', '20'),
  ],
  ticketTypes: [
    { id: 1, name: 'Conference Pass', description: null },
    { id: 2, name: 'Sponsor Pass', description: null },
  ],
  totalTickets: 120,
  count: 2,
  usageStatus: 'resolved',
  conferenceInfo: { customerId: 7, eventId: 4242, title: 'Konf 2026' },
}

function renderPanel(data: UsagePayload = PAYLOAD) {
  q.useQuery.mockReturnValue({ data, isLoading: false, error: null })
  return render(
    <NotificationProvider>
      <DiscountCodeManager
        sponsors={[SPONSOR]}
        eventId={4242}
        providerLabel="Checkin.no"
        conference={CONFERENCE}
        defaultCustomDiscountsExpanded={true}
      />
    </NotificationProvider>,
  )
}

/** The code table, scoped — the sponsor table renders rows for the same codes. */
const codeTable = () =>
  document.getElementById('discount-codes-section') as HTMLElement

const openForm = () => {
  fireEvent.click(screen.getByRole('button', { name: /new standalone code/i }))
}

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

/** The desktop row for a code inside the code table. */
function codeRow(code: string): HTMLElement {
  const row = within(codeTable())
    .getAllByText(code)
    .map((el) => el.closest('tr'))
    .find((el): el is HTMLTableRowElement => el !== null)
  if (!row) throw new Error(`no code-table row rendered for ${code}`)
  return row
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('creating a standalone code', () => {
  it('issues it with NO sponsor, at the rate typed', () => {
    renderPanel()
    openForm()

    type(/^Code$/, 'community2026')
    type(/Discount \(%\)/, '20')
    type(/Usage limit/, '25')
    fireEvent.click(screen.getByRole('button', { name: /create code/i }))

    expect(q.createMutate).toHaveBeenCalledTimes(1)
    const sent = q.createMutate.mock.calls[0][0]
    // The whole point: no sponsor is attached, and the tRPC input no longer
    // requires one.
    expect(sent.sponsorName).toBeUndefined()
    expect(sent.tierTitle).toBeUndefined()
    expect(sent).toMatchObject({
      eventId: 4242,
      // Upper-cased on the way in: redemption matching is case-insensitive but
      // the code an organizer hands out should read as one string.
      discountCode: 'COMMUNITY2026',
      discountPercentage: 20,
      numberOfTickets: 25,
      selectedTicketTypes: [],
    })
  })

  it('scopes the code to the ticket types picked', () => {
    renderPanel()
    openForm()

    type(/^Code$/, 'PARTNER')
    fireEvent.click(screen.getByRole('button', { name: /all ticket types/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Sponsor Pass/ }))
    // The menu stays open (`keepOpen`) and Headless UI marks the rest of the
    // page inert while it is, so it has to be dismissed before the form's own
    // controls are reachable again.
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    fireEvent.click(screen.getByRole('button', { name: /create code/i }))

    expect(q.createMutate.mock.calls[0][0].selectedTicketTypes).toEqual(['2'])
  })

  it.each([
    ['', /Enter a code/i],
    ['HAS SPACE', /letters, digits and hyphens/i],
  ])('refuses %s without calling the mutation', (code, message) => {
    renderPanel()
    openForm()

    if (code) type(/^Code$/, code)
    fireEvent.click(screen.getByRole('button', { name: /create code/i }))

    expect(screen.getByText(message)).toBeTruthy()
    expect(q.createMutate).not.toHaveBeenCalled()
  })

  it.each(['0', '101', '7.5'])(
    'refuses %s%% without calling the mutation',
    (percentage) => {
      renderPanel()
      openForm()

      type(/^Code$/, 'COMMUNITY')
      type(/Discount \(%\)/, percentage)
      fireEvent.click(screen.getByRole('button', { name: /create code/i }))

      expect(screen.getByText(/between 1 and 100/i)).toBeTruthy()
      expect(q.createMutate).not.toHaveBeenCalled()
    },
  )

  /**
   * FOUND BY LOOKING AT IT, not by a test — which is why this one exists.
   *
   * The submit button was built as a shared base class plus a primary
   * override, and the base already carried `bg-white text-gray-700`. Tailwind
   * utilities of equal specificity are resolved by their order in the generated
   * stylesheet, not by their order in the `class` attribute, so the result was
   * white text on a white background: an invisible button that was still
   * present, still named "Create code", still 44px tall, and still passed every
   * assertion around it.
   *
   * jsdom loads no stylesheet, so the colour itself cannot be measured here.
   * What CAN be asserted is the cause: no button may claim two backgrounds.
   */
  it('never puts two competing backgrounds on one button', () => {
    renderPanel()
    openForm()

    // UNPREFIXED utilities only: `hover:` and `dark:` variants are a different
    // cascade layer and legitimately restate the background.
    for (const name of [/^Cancel$/, /^Create code$/, /^Create code$/]) {
      const classes = screen
        .getByRole('button', { name })
        .className.split(/\s+/)
      expect(classes.filter((c) => /^bg-/.test(c))).toHaveLength(1)
      expect(
        classes.filter((c) => /^text-(?!sm$|xs$|base$)/.test(c)),
      ).toHaveLength(1)
    }
  })

  /**
   * The sponsor row's own create button must stay exactly one button with
   * exactly that name — the form's submit is "Create code", a different
   * control, and must not be mistaken for it.
   */
  it('does not disturb the sponsor row’s create action', () => {
    renderPanel({ ...PAYLOAD, discounts: [] })

    expect(
      screen.getAllByRole('button', {
        name: /create discount code for Acme Cloud/i,
      }),
    ).toHaveLength(2)
  })

  /**
   * THE REGRESSION, from the client side. Both kinds now go through one
   * `createCode` helper, so the sponsor path could silently pick up the form's
   * rate. A sponsor code is a comp: 100, always, and with the sponsor named.
   */
  it('still sends a sponsor code as a 100% comp', () => {
    renderPanel({ ...PAYLOAD, discounts: [] })

    fireEvent.click(
      screen.getAllByRole('button', {
        name: /create discount code for Acme Cloud/i,
      })[0],
    )

    expect(q.createMutate).toHaveBeenCalledTimes(1)
    expect(q.createMutate.mock.calls[0][0]).toMatchObject({
      eventId: 4242,
      discountPercentage: 100,
      numberOfTickets: 5,
      sponsorName: 'Acme Cloud',
      tierTitle: 'Gold',
    })
  })
})

describe('one listing for both kinds', () => {
  it('lists the sponsor code and the standalone code together, labelled', () => {
    renderPanel()

    // Both are in the SAME table — the sponsor code used to be filtered out of
    // it entirely, leaving two disconnected views.
    expect(
      within(codeRow('ACMECLOUD1234')).getByText('Sponsor: Acme Cloud'),
    ).toBeTruthy()
    expect(
      within(codeRow('COMMUNITY2026')).getByText('Standalone'),
    ).toBeTruthy()
  })

  it('reports usage for a standalone code the same way', () => {
    renderPanel()

    const row = codeRow('COMMUNITY2026')
    expect(within(row).getByText('3 / 10')).toBeTruthy()
    expect(within(row).getByText('30% used')).toBeTruthy()
    // Ours, so no vendor-source hint.
    expect(within(row).queryByText(/Checkin\.no count/)).toBeNull()
  })

  it('falls back to the vendor counter for a standalone code too', () => {
    renderPanel({
      ...PAYLOAD,
      usageStatus: 'unavailable',
      // `actualUsage` OMITTED, not zeroed — the router refuses to invent a
      // count it never obtained, and the panel must fall back rather than
      // render a zero.
      discounts: PAYLOAD.discounts.map((d) => {
        const withoutOurs = { ...d, times: 4 }
        delete (withoutOurs as Partial<typeof withoutOurs>).actualUsage
        return withoutOurs
      }),
    })

    const row = codeRow('COMMUNITY2026')
    expect(within(row).getByText('4 / 10')).toBeTruthy()
    expect(within(row).getByText(/Checkin\.no count/)).toBeTruthy()
  })

  it('deletes a standalone code through the shared mutation', () => {
    renderPanel()

    fireEvent.click(within(codeRow('COMMUNITY2026')).getByTitle('Delete Code'))

    expect(q.deleteMutate).toHaveBeenCalledWith({
      eventId: 4242,
      discountCode: 'COMMUNITY2026',
    })
  })

  /**
   * The card layout's delete is the one an organizer reaches on a phone. It was
   * the table's 34px icon, whose meaning lived in a `title` that touch devices
   * never show — the same defect #1077 fixed on the sponsor rows.
   */
  it('gives the mobile card a labelled 44px delete', () => {
    renderPanel()

    const labelled = screen
      .getAllByRole('button')
      .filter((b) => /^\s*Delete code\s*$/.test(b.textContent ?? ''))

    // One per code in the listing — the sponsor table's own card delete is not
    // rendered here because Acme Cloud already has a code shown in its row.
    expect(labelled.length).toBeGreaterThanOrEqual(2)
    labelled.forEach((b) => expect(b.className).toContain('min-h-11'))
  })
})
