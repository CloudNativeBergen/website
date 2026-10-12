/**
 * @vitest-environment jsdom
 *
 * CONFIRMING A TICKET TYPE'S ROLE, on the card that shows the type.
 *
 * `conference.ticketTypeRoles` decides whether a ticket type seats a human, and
 * it moves the participant count on /admin/tickets. Before this control the
 * only way to answer was to edit the conference document in Sanity Studio —
 * which required knowing the field existed.
 *
 * What is pinned here is what an organizer can MISREAD:
 *
 *  - a proposal must read as a suggestion, never as settled fact, and must
 *    carry its evidence and sample size on the card (confirming a role you
 *    cannot check is how a wrong number becomes a blessed one);
 *  - a declared role must read as settled AND still be changeable, because a
 *    mistaken confirm has to be reversible without Studio;
 *  - an override must be honoured over the proposal it contradicts.
 *
 * Assertions are on the MUTATION ARGUMENTS, not on the UI settling, because the
 * argument is the thing that reaches the conference document.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { TicketTypeProposal } from '@/lib/tickets/discovery'
import { TicketTypeRoleControl } from './TicketTypeRoleControl'

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
  /** The hook's own callbacks, so a case can answer the save it sent. */
  options: {} as {
    onError?: (error: { message: string; data?: { code?: string } }) => void
  },
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    tickets: {
      admin: {
        setTicketTypeRole: {
          useMutation: (options: typeof h.options) => {
            h.options = options
            return { mutate: h.mutate, isPending: false }
          },
        },
      },
    },
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh }),
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))

const UPGRADE = 'Sponsor discount (workshop upgrade)'

const addOnProposal: TicketTypeProposal = {
  typeName: UPGRADE,
  admits: false,
  grants: 'unknown',
  evidence: '10 of 10 holders also hold a “Conference Pass” ticket',
  sampleSize: 10,
  confidence: 'high',
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('a proposed role', () => {
  it('reads as a suggestion awaiting confirmation, not as settled', () => {
    render(
      <TicketTypeRoleControl typeName={UPGRADE} proposal={addOnProposal} />,
    )

    expect(screen.getByText(/Suggested — not confirmed/)).toBeInTheDocument()
    expect(screen.queryByText('Declared')).not.toBeInTheDocument()
    // Nothing is pre-selected: a proposal is not an answer.
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-pressed', 'false')
    }
    // And it says what is being counted MEANWHILE, since the proposal moves no
    // number until it is confirmed.
    expect(
      screen.getByText(/counted as\s+seating one attendee/),
    ).toBeInTheDocument()
  })

  it('shows the evidence and the sample size without a click', () => {
    render(
      <TicketTypeRoleControl typeName={UPGRADE} proposal={addOnProposal} />,
    )

    expect(
      screen.getByText(/10 of 10 holders also hold a “Conference Pass” ticket/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Based on 10 holders/)).toBeInTheDocument()
  })

  it('says so when the sample is too small to be sure', () => {
    render(
      <TicketTypeRoleControl
        typeName={UPGRADE}
        proposal={{ ...addOnProposal, sampleSize: 2, confidence: 'low' }}
      />,
    )

    expect(screen.getByText(/too few to be sure/)).toBeInTheDocument()
  })

  it('confirms in one action, writing the proposed role', () => {
    render(
      <TicketTypeRoleControl typeName={UPGRADE} proposal={addOnProposal} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Add-on/ }))

    expect(h.mutate).toHaveBeenCalledTimes(1)
    expect(h.mutate).toHaveBeenCalledWith({
      typeName: UPGRADE,
      admits: false,
    })
  })

  /** A proposal is a suggestion; the organizer's contradiction is the answer. */
  it('honours an override that contradicts the proposal', () => {
    render(
      <TicketTypeRoleControl typeName={UPGRADE} proposal={addOnProposal} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Seats an attendee/ }))

    expect(h.mutate).toHaveBeenCalledWith({ typeName: UPGRADE, admits: true })
  })

  /**
   * A discount-derived proposal speaks only to how a ticket was PAID for, so it
   * suggests nothing about seating — and must not be dressed up as a suggestion.
   */
  it('does not suggest a role when the evidence says nothing about seating', () => {
    render(
      <TicketTypeRoleControl
        typeName={UPGRADE}
        proposal={{
          ...addOnProposal,
          admits: 'unknown',
          grants: true,
          evidence: 'the 100%-off code “ACME1234” applies to this type',
        }}
      />,
    )

    expect(screen.queryByText(/Suggested/)).not.toBeInTheDocument()
    expect(screen.getByText('Not set')).toBeInTheDocument()
    // The evidence still shows — it is true, it just answers another question.
    expect(screen.getByText(/ACME1234/)).toBeInTheDocument()
  })
})

describe('a declared role', () => {
  it('reads as settled, and as the role that was declared', () => {
    render(
      <TicketTypeRoleControl
        typeName={UPGRADE}
        declaredAdmits={false}
        proposal={addOnProposal}
      />,
    )

    expect(screen.getByText('Declared')).toBeInTheDocument()
    expect(screen.queryByText(/Suggested/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add-on/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('is still changeable — a mistaken confirm is reversible without Studio', () => {
    render(<TicketTypeRoleControl typeName={UPGRADE} declaredAdmits={false} />)

    fireEvent.click(screen.getByRole('button', { name: /Seats an attendee/ }))

    expect(h.mutate).toHaveBeenCalledWith({ typeName: UPGRADE, admits: true })
  })
})

describe('an undeclared type nothing is known about', () => {
  it('reads as unknown, and names what is being counted instead', () => {
    render(<TicketTypeRoleControl typeName="Mystery pass" />)

    expect(screen.getByText('Not set')).toBeInTheDocument()
    expect(screen.queryByText(/Evidence:/)).not.toBeInTheDocument()
    expect(
      screen.getByText(/nothing in the data hints either way/),
    ).toBeInTheDocument()
  })

  it('offers both roles explicitly', () => {
    render(<TicketTypeRoleControl typeName="Mystery pass" />)

    fireEvent.click(screen.getByRole('button', { name: /Add-on/ }))
    expect(h.mutate).toHaveBeenCalledWith({
      typeName: 'Mystery pass',
      admits: false,
    })
  })
})

/** The consequence has to be on the card, before the click that causes it. */
it('says what saving changes', () => {
  render(<TicketTypeRoleControl typeName={UPGRADE} proposal={addOnProposal} />)

  expect(
    screen.getByText(/changes the participant count and seats-used figure/),
  ).toBeInTheDocument()
})

/**
 * A SAVE NOBODY CAN CONFIRM. The server answers `BAD_GATEWAY` when its write
 * to Sanity failed in a way that does not say whether it was stored, and a
 * request can also get no answer at all. Either way the role MAY have been
 * saved, so the card must not say "Could not save" (or print "Failed to
 * fetch"): it says the outcome is unknown and reloads what is stored.
 */
describe('a save whose outcome is unknown', () => {
  const save = () => {
    render(<TicketTypeRoleControl typeName={UPGRADE} />)
    fireEvent.click(screen.getByRole('button', { name: /^Add-on/ }))
    expect(h.mutate).toHaveBeenCalledTimes(1)
  }
  const UNKNOWN = {
    type: 'warning',
    title: 'This change may or may not have been saved',
    message:
      'The save could not be confirmed. Reload the page and check this ticket type before trying again.',
  }

  it.each([
    [
      'the server could not confirm its write',
      {
        message: 'The save could not be confirmed.',
        data: { code: 'BAD_GATEWAY' },
      },
    ],
    ['the request got no answer', { message: 'Failed to fetch' }],
  ])('says so, and reloads, when %s', (_when, error) => {
    save()

    act(() => h.options.onError!(error))

    expect(h.notify.mock.calls).toEqual([[UNKNOWN]])
    expect(h.refresh).toHaveBeenCalledTimes(1)
  })

  /**
   * "CHECK THIS TICKET TYPE" HAS TO SHOW WHAT IS STORED. On an error the card
   * puts back the answer it had, and it used to keep that for good: its state
   * was only ever read from the prop at mount. So after a save that DID land,
   * the reload brought the new answer and the card went on showing the old
   * one, and the organizer who was told to check concluded nothing was saved.
   */
  it('shows the stored answer the reload brings back', () => {
    const { rerender } = render(<TicketTypeRoleControl typeName={UPGRADE} />)
    const addOn = () => screen.getByRole('button', { name: /^Add-on/ })
    fireEvent.click(addOn())
    act(() => h.options.onError!({ message: 'Failed to fetch' }))
    // Back to what the card knew: nothing declared.
    expect(addOn()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Not set')).toBeInTheDocument()

    // The write had landed, and the reloaded page says so.
    rerender(
      <TicketTypeRoleControl typeName={UPGRADE} declaredAdmits={false} />,
    )

    expect(addOn()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Declared')).toBeInTheDocument()
  })

  it('shows the old answer still, when the reload says the write did not land', () => {
    const { rerender } = render(
      <TicketTypeRoleControl typeName={UPGRADE} declaredAdmits />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Add-on/ }))
    act(() => h.options.onError!({ message: 'Failed to fetch' }))

    rerender(<TicketTypeRoleControl typeName={UPGRADE} declaredAdmits />)

    expect(
      screen.getByRole('button', { name: /^Seats an attendee/ }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('still says the save failed when the server refused it', () => {
    save()

    act(() =>
      h.options.onError!({
        message: 'Reload the page and try again.',
        data: { code: 'CONFLICT' },
      }),
    )

    expect(h.notify.mock.calls).toEqual([
      [
        {
          type: 'error',
          title: 'Could not save',
          message: 'Reload the page and try again.',
        },
      ],
    ])
    expect(h.refresh).not.toHaveBeenCalled()
  })
})
