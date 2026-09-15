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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

const emailModalProps = vi.hoisted(
  () => ({ current: null }) as { current: Record<string, unknown> | null },
)
const showNotification = vi.hoisted(() => vi.fn())
const sendDiscountEmail = vi.hoisted(() => vi.fn())
const saveSponsorLink = vi.hoisted(() => vi.fn())
const routerRefresh = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}))

// The real EmailModal drags in the portable-text editor; only the props this
// component computes are under test.
vi.mock('@/components/admin', () => ({
  useNotification: () => ({ showNotification }),
  EmailModal: (props: Record<string, unknown>) => {
    emailModalProps.current = props
    return (
      <div>
        <span data-testid="ticket-url">{String(props.ticketUrl ?? '')}</span>
        <div>{props.warningContent as React.ReactNode}</div>
        <div>{props.ticketUrlAction as React.ReactNode}</div>
      </div>
    )
  },
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      crm: {
        sendDiscountEmail: {
          useMutation: () => ({
            mutateAsync: sendDiscountEmail,
            isPending: false,
          }),
        },
      },
    },
    conference: {
      updateSponsorRegistrationLink: {
        useMutation: () => ({
          mutateAsync: saveSponsorLink,
          isPending: false,
        }),
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

beforeEach(() => {
  sendDiscountEmail.mockResolvedValue({ recipientCount: 2 })
  saveSponsorLink.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  emailModalProps.current = null
  vi.clearAllMocks()
})

const SAVE_BUTTON = 'Save as conference default'

function typeTicketUrl(url: string) {
  const onTicketUrlChange = emailModalProps.current?.onTicketUrlChange as (
    url: string,
  ) => void
  return act(async () => {
    onTicketUrlChange(url)
  })
}

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

/**
 * The invite link cannot be produced by Checkin's API, so an organizer pastes
 * it by hand. Left in localStorage it helps nobody else; saving it to the
 * conference is offered, never automatic.
 */
describe('SponsorDiscountEmailModal save-to-conference offer', () => {
  it('stays hidden while the ticket URL matches the stored link', () => {
    renderModal({ sponsorRegistrationLink: INVITE_LINK })
    expect(screen.queryByRole('button', { name: SAVE_BUTTON })).toBeNull()
  })

  it('appears once the ticket URL differs from the stored link', async () => {
    renderModal({ sponsorRegistrationLink: INVITE_LINK })
    await typeTicketUrl(`${INVITE_LINK}&edited=1`)
    expect(
      screen.getByRole('button', { name: SAVE_BUTTON }),
    ).toBeInTheDocument()
  })

  it('ignores surrounding whitespace when comparing with the stored link', async () => {
    renderModal({ sponsorRegistrationLink: INVITE_LINK })
    await typeTicketUrl(`  ${INVITE_LINK}  `)
    expect(screen.queryByRole('button', { name: SAVE_BUTTON })).toBeNull()
  })

  it('does not offer to save an empty ticket URL', async () => {
    renderModal({ sponsorRegistrationLink: INVITE_LINK })
    await typeTicketUrl('   ')
    expect(screen.queryByRole('button', { name: SAVE_BUTTON })).toBeNull()
  })

  /**
   * The default ticket URL is the PUBLIC store when no invite link is stored.
   * Offering to save it would write the hidden-ticket-types bug into the
   * conference and remove the warning that flags it.
   */
  it('does not offer to save before the organizer types anything', () => {
    renderModal({ registrationLink: 'https://public.example.com/tickets' })
    expect(screen.getByTestId('ticket-url')).toHaveTextContent(
      'https://public.example.com/tickets',
    )
    expect(screen.queryByRole('button', { name: SAVE_BUTTON })).toBeNull()
    // The warning is the only thing that should speak here.
    expect(screen.getByText('No Sponsor Registration Link')).toBeInTheDocument()
  })

  it('never offers to save the public store link, even if typed back in', async () => {
    renderModal({ registrationLink: 'https://public.example.com/tickets' })
    await typeTicketUrl(INVITE_LINK)
    expect(
      screen.getByRole('button', { name: SAVE_BUTTON }),
    ).toBeInTheDocument()

    await typeTicketUrl('https://public.example.com/tickets')
    expect(screen.queryByRole('button', { name: SAVE_BUTTON })).toBeNull()
  })

  it('does not offer to save the /tickets fallback', () => {
    renderModal({})
    expect(screen.getByTestId('ticket-url')).toHaveTextContent('/tickets')
    expect(screen.queryByRole('button', { name: SAVE_BUTTON })).toBeNull()
  })

  it('saves the typed link to the conference and stops offering', async () => {
    renderModal({ registrationLink: 'https://public.example.com/tickets' })
    await typeTicketUrl(INVITE_LINK)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SAVE_BUTTON }))
    })

    expect(saveSponsorLink).toHaveBeenCalledWith({
      sponsorRegistrationLink: INVITE_LINK,
    })
    expect(screen.queryByRole('button', { name: SAVE_BUTTON })).toBeNull()
    // The warning spoke about the same gap, so it has to agree afterwards.
    expect(screen.queryByText('No Sponsor Registration Link')).toBeNull()
  })

  /**
   * The modal unmounts on close, so its local state cannot carry the save to
   * the next sponsor. Without a refresh of the server-rendered conference, the
   * next modal claims the link was never saved.
   */
  it('refreshes the server-rendered conference after a successful save', async () => {
    renderModal({ registrationLink: 'https://public.example.com/tickets' })
    await typeTicketUrl(INVITE_LINK)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SAVE_BUTTON }))
    })

    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the save failed', async () => {
    saveSponsorLink.mockRejectedValue(new Error('Sanity write rejected'))
    renderModal({ registrationLink: 'https://public.example.com/tickets' })
    await typeTicketUrl(INVITE_LINK)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SAVE_BUTTON }))
    })

    expect(routerRefresh).not.toHaveBeenCalled()
  })

  it('keeps the email sendable and reports the failure when the save fails', async () => {
    saveSponsorLink.mockRejectedValue(new Error('Sanity write rejected'))
    renderModal({ registrationLink: 'https://public.example.com/tickets' })
    await typeTicketUrl(INVITE_LINK)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SAVE_BUTTON }))
    })

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Could not save the link',
      }),
    )

    const onSend = emailModalProps.current?.onSend as (input: {
      subject: string
      message: never[]
    }) => Promise<void>
    await act(async () => {
      await onSend({ subject: 'Your code', message: [] })
    })

    expect(sendDiscountEmail).toHaveBeenCalledWith(
      expect.objectContaining({ ticketUrl: INVITE_LINK }),
    )
  })
})
