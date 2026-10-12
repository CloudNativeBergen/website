/**
 * @vitest-environment jsdom
 *
 * `available: null` means the vendor reported NO remaining count — the same
 * rule `getTicketAvailability` states in `lib/tickets/public.ts` ("Checkin
 * passes `available` through raw and it is frequently null … render unknown as
 * no availability claim"). This card used to print "Unlimited" for it, so a
 * capped type read as uncapped and could be oversold.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

// The card now carries the ticket-type ROLE control, which is a client island:
// it wants a router, a tRPC mutation and the admin notification context. Its own
// behaviour is pinned in `TicketTypeRoleControl.test.tsx`.
vi.mock('@/lib/trpc/client', () => ({
  api: {
    tickets: {
      admin: {
        setTicketTypeRole: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        setWorkshopAccess: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
    },
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

import { TicketTypeCard } from './TicketTypeCard'
import type { PublicTicketType } from '@/lib/tickets/provider/types'

afterEach(cleanup)

/** The control's props for one type, as the page's server-built list gives them. */
const control = (stored?: boolean, configured = false) => ({
  type: {
    typeName: 'Conference Pass',
    access: stored ? ('granted' as const) : ('denied' as const),
    ...(stored !== undefined && { stored }),
    lastGranting: false,
    builtInGrants: false,
    builtInGrantedOthers: [],
    builtInGrantedOthersSetToNo: [],
  },
  configured,
  builtInGranted: [],
})

const paidTicket: PublicTicketType = {
  id: 4821,
  name: 'Conference Pass',
  type: 'regular',
  description: null,
  price: [{ price: '4500.00', vat: '25', description: null, key: 'nok' }],
  available: 120,
  requiresInvitation: false,
  visibleStartsAt: null,
  visibleEndsAt: null,
  position: 1,
}

describe('availability', () => {
  it('never claims Unlimited when the vendor reported no remaining count', () => {
    render(
      <TicketTypeCard
        ticket={{ ...paidTicket, available: null }}
        publicFreeTicketIds={[]}
        workshopAccess={control()}
      />,
    )

    expect(screen.queryByText('Unlimited')).not.toBeInTheDocument()
    expect(screen.getByText('Not reported')).toBeInTheDocument()
  })

  it('shows the count when the vendor did report one', () => {
    render(
      <TicketTypeCard
        ticket={paidTicket}
        publicFreeTicketIds={[]}
        workshopAccess={control()}
      />,
    )

    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('remaining')).toBeInTheDocument()
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument()
  })

  it('does not read zero remaining as unknown either', () => {
    render(
      <TicketTypeCard
        ticket={{ ...paidTicket, available: 0 }}
        publicFreeTicketIds={[]}
        workshopAccess={control()}
      />,
    )

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument()
  })
})

/**
 * WHERE WORKSHOP ACCESS IS EDITED (#1332). A conference with workshops edits
 * the list under /admin/workshops, so the card only shows the answer and links
 * there. A conference without workshops has no such page (it answers 404), so
 * its card keeps the control and must not link to it.
 */
describe('workshop access', () => {
  const HREF = '/admin/workshops#workshop-tickets'
  const writers = () =>
    screen.queryAllByRole('button', { name: /workshop access/i })

  it.each([
    ['granted', true, 'Grants workshop access'],
    ['denied', true, 'No workshop access'],
    ['unclassified', true, 'Not set'],
    ['granted', false, 'Grants workshop access (built-in list)'],
    ['denied', false, 'No workshop access (built-in list)'],
  ] as const)(
    'shows %s (configured: %s) as a badge that links to the section, with no control',
    (access, configured, label) => {
      render(
        <TicketTypeCard
          ticket={paidTicket}
          publicFreeTicketIds={[]}
          workshopAccess={{ sectionHref: HREF, access, configured }}
        />,
      )

      const link = screen.getByRole('link', {
        name: `${label} Change under Workshops`,
      })
      expect(link).toHaveAttribute('href', HREF)
      // Nothing on the card writes workshop access any more.
      expect(writers()).toHaveLength(0)
    },
  )

  it('keeps the control, and links nowhere, on a conference without workshops', () => {
    render(
      <TicketTypeCard
        ticket={paidTicket}
        publicFreeTicketIds={[]}
        workshopAccess={control(true, true)}
      />,
    )

    expect(
      writers().map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Grants workshop access — "Conference Pass"',
      'No workshop access — "Conference Pass"',
    ])
    expect(
      screen
        .queryAllByRole('link')
        .filter((a) => a.getAttribute('href')?.includes('/admin/workshops')),
    ).toHaveLength(0)
  })
})
