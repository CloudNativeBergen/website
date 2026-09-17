/**
 * @vitest-environment jsdom
 *
 * `available: null` means the vendor reported NO remaining count — the same
 * rule `getTicketAvailability` states in `lib/tickets/public.ts` ("Checkin
 * passes `available` through raw and it is frequently null … render unknown as
 * no availability claim"). This card used to print "Unlimited" for it, so a
 * capped type read as uncapped and could be oversold.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

import { TicketTypeCard } from './TicketTypeCard'
import type { PublicTicketType } from '@/lib/tickets/provider/types'

afterEach(cleanup)

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
      />,
    )

    expect(screen.queryByText('Unlimited')).not.toBeInTheDocument()
    expect(screen.getByText('Not reported')).toBeInTheDocument()
  })

  it('shows the count when the vendor did report one', () => {
    render(<TicketTypeCard ticket={paidTicket} publicFreeTicketIds={[]} />)

    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('remaining')).toBeInTheDocument()
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument()
  })

  it('does not read zero remaining as unknown either', () => {
    render(
      <TicketTypeCard
        ticket={{ ...paidTicket, available: 0 }}
        publicFreeTicketIds={[]}
      />,
    )

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument()
  })
})
