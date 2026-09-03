/**
 * @vitest-environment jsdom
 *
 * WHERE THE SPONSOR DISCOUNT EMAIL SENDS PEOPLE.
 *
 * Sponsor ticket types are HIDDEN on Checkin's public store, so the public
 * `registrationLink` shows a sponsor a page their tickets do not appear on.
 * Only the conference's `sponsorRegistrationLink` (Checkin's own
 * `action=invite&category=&pass=` link) reveals them, so it wins the default,
 * and its absence is called out where the organizer can still fix it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const emailModalProps = vi.hoisted(
  () => ({ current: null }) as { current: Record<string, unknown> | null },
)

// The real EmailModal drags in the portable-text editor; only the props this
// component computes are under test.
vi.mock('@/components/admin', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
  EmailModal: (props: Record<string, unknown>) => {
    emailModalProps.current = props
    return (
      <div>
        <span data-testid="ticket-url">{String(props.ticketUrl ?? '')}</span>
        <div>{props.warningContent as React.ReactNode}</div>
      </div>
    )
  },
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      crm: {
        sendDiscountEmail: {
          useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
        },
      },
    },
  },
}))

import { SponsorDiscountEmailModal } from './SponsorDiscountEmailModal'

const sponsor = {
  id: 'sponsor-1',
  name: 'TechGiant Corp',
  tier: { title: 'Gold', tagline: 'Gold tier', tierType: 'standard' as const },
  ticketEntitlement: 5,
}

const baseConference = {
  title: 'Test Conf 2026',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-10-10',
  domains: ['conf.example.com'],
  contactEmail: 'hello@conf.example.com',
}

const INVITE_LINK =
  'https://event.checkin.no/999999?action=invite&category=111111&pass=FAKE-TEST-TOKEN'

function renderModal(conference: Record<string, unknown>) {
  render(
    <SponsorDiscountEmailModal
      isOpen
      onClose={() => {}}
      sponsor={sponsor}
      discountCode="SPONSOR-GOLD-2026"
      domain="conf.example.com"
      fromEmail="hello@conf.example.com"
      conference={
        {
          ...baseConference,
          ...conference,
        } as React.ComponentProps<
          typeof SponsorDiscountEmailModal
        >['conference']
      }
    />,
  )
}

afterEach(() => {
  cleanup()
  emailModalProps.current = null
})

describe('SponsorDiscountEmailModal ticket URL', () => {
  it('defaults to the sponsor registration link when set', () => {
    renderModal({
      sponsorRegistrationLink: INVITE_LINK,
      registrationLink: 'https://public.example.com/tickets',
    })
    expect(screen.getByTestId('ticket-url')).toHaveTextContent(INVITE_LINK)
  })

  it('falls back to the public registration link', () => {
    renderModal({ registrationLink: 'https://public.example.com/tickets' })
    expect(screen.getByTestId('ticket-url')).toHaveTextContent(
      'https://public.example.com/tickets',
    )
  })

  it('falls back to the conference /tickets page', () => {
    renderModal({})
    expect(screen.getByTestId('ticket-url')).toHaveTextContent('/tickets')
  })

  it('warns when the sponsor registration link is unset', () => {
    renderModal({ registrationLink: 'https://public.example.com/tickets' })
    expect(screen.getByText('No Sponsor Registration Link')).toBeInTheDocument()
  })

  it('does not warn when the sponsor registration link is set', () => {
    renderModal({ sponsorRegistrationLink: INVITE_LINK })
    expect(screen.queryByText('No Sponsor Registration Link')).toBeNull()
  })
})
