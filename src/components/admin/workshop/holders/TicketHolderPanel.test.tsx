/**
 * @vitest-environment jsdom
 *
 * "Ticket holders" on `/admin/workshops` (#1333): what an organizer reads for
 * each state of the join, and what the flagged list's actions send.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { TAP_GUARD_MS } from '@/hooks/useOpenedLongEnough'
import { TicketHolderPanel } from './TicketHolderPanel'
import type { ReadyTicketHolderStats, TicketHolderView } from './view'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** A question ignores its confirm button for a moment after it opens. */
const aMomentLater = () =>
  act(() => {
    vi.advanceTimersByTime(TAP_GUARD_MS)
  })

const flaggedSignup = (
  _id: string,
  status: 'confirmed' | 'waitlist',
  title: string,
) => ({
  _id,
  userEmail: 'eve@x.test',
  userName: 'Eve Example',
  status,
  workshop: { _id: `w-${_id}`, title },
})

const STATS: ReadyTicketHolderStats = {
  available: true,
  configured: true,
  holders: 41,
  confirmed: 23,
  waitlistOnly: 5,
  notSignedUp: 13,
  flagged: [
    {
      email: 'eve@x.test',
      name: 'Eve Example',
      signups: [
        flaggedSignup('s-1', 'confirmed', 'Kubernetes 101'),
        flaggedSignup('s-2', 'waitlist', 'eBPF deep dive'),
      ],
    },
  ],
  lockedOut: [],
}
const ready = (
  overrides: Partial<ReadyTicketHolderStats> = {},
): TicketHolderView => ({ state: 'ready', stats: { ...STATS, ...overrides } })
const READY = ready()

function renderPanel(view: TicketHolderView) {
  const actions = {
    onRetry: vi.fn(),
    onMoveToWaitlist: vi.fn(),
    onDeleteSignup: vi.fn(),
  }
  render(<TicketHolderPanel view={view} {...actions} />)
  return actions
}

/** A stat tile's value, by its label. */
const valueOf = (label: string) =>
  screen.getByText(label, { selector: 'span' }).nextElementSibling?.textContent

describe('TicketHolderPanel', () => {
  it('shows each number on its value', () => {
    renderPanel(READY)
    expect(valueOf('Holders')).toBe('41')
    expect(valueOf('Confirmed')).toBe('23')
    expect(valueOf('Waitlist only')).toBe('5')
    expect(valueOf('Not signed up')).toBe('13')
    expect(valueOf('Flagged')).toBe('1')
  })

  it('a failed read says unavailable and shows no number', () => {
    const { onRetry } = renderPanel({ state: 'unavailable', retrying: false })
    const panel = screen.getByRole('region', { name: 'Ticket holders' })
    expect(panel.textContent).toMatch(/unavailable/i)
    expect(panel.textContent).not.toMatch(/\d/)
    expect(screen.queryByText('Holders', { selector: 'span' })).toBeNull()
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('while a retry is on its way, says so and does not start another', () => {
    const { onRetry } = renderPanel({ state: 'unavailable', retrying: true })
    const retry = screen.getByRole('button', { name: 'Trying again…' })
    expect(retry).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(retry)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('while loading, shows no number either', () => {
    renderPanel({ state: 'loading' })
    const panel = screen.getByRole('region', { name: 'Ticket holders' })
    expect(panel.textContent).not.toMatch(/\d/)
    expect(within(panel).getByRole('status').textContent).toMatch(/Reading/)
  })

  it('names the built-in list while nothing is marked', () => {
    renderPanel(ready({ configured: false }))
    expect(screen.getByText(/built-in list/)).toBeTruthy()
  })

  it('the flagged list names each person and their workshops', () => {
    renderPanel(READY)
    fireEvent.click(screen.getByRole('button', { name: 'Flagged, 1' }))
    const list = screen.getByRole('dialog', { name: 'Flagged sign-ups' })
    expect(within(list).getAllByText('Eve Example').length).toBeGreaterThan(0)
    expect(within(list).getAllByText('eve@x.test').length).toBeGreaterThan(0)
    expect(within(list).getAllByText('Kubernetes 101').length).toBeGreaterThan(
      0,
    )
    expect(within(list).getAllByText('eBPF deep dive').length).toBeGreaterThan(
      0,
    )
  })

  it('"Move to waitlist" asks first, then moves the confirmed sign-up', () => {
    vi.useFakeTimers()
    const { onMoveToWaitlist } = renderPanel(READY)
    fireEvent.click(screen.getByRole('button', { name: 'Flagged, 1' }))
    const list = screen.getByRole('dialog', { name: 'Flagged sign-ups' })
    // Only the confirmed sign-up can be moved.
    // The table; the phone cards repeat each control.
    const table = within(list).getByRole('table')
    const [move, ...more] = within(table).getAllByRole('button', {
      name: 'Move to waitlist',
    })
    expect(more).toHaveLength(0)
    fireEvent.click(move)
    expect(onMoveToWaitlist).not.toHaveBeenCalled()

    const question = screen.getByRole('dialog', { name: 'Move to waitlist' })
    aMomentLater()
    expect(question.textContent).toContain(
      'Move Eve Example to the waitlist for Kubernetes 101?',
    )
    fireEvent.click(
      within(question).getByRole('button', { name: 'Move to waitlist' }),
    )
    expect(onMoveToWaitlist).toHaveBeenCalledWith('s-1', 'Eve Example')
  })

  it('"Delete participant" asks "Delete signup", then deletes that sign-up', () => {
    vi.useFakeTimers()
    const { onDeleteSignup } = renderPanel(READY)
    fireEvent.click(screen.getByRole('button', { name: 'Flagged, 1' }))
    const list = screen.getByRole('dialog', { name: 'Flagged sign-ups' })
    const table = within(list).getByRole('table')
    const deletes = within(table).getAllByTitle('Delete participant')
    expect(deletes).toHaveLength(2)
    fireEvent.click(deletes[1])
    expect(onDeleteSignup).not.toHaveBeenCalled()

    const question = screen.getByRole('dialog', { name: 'Delete signup' })
    aMomentLater()
    expect(question.textContent).toContain(
      "delete Eve Example's signup for eBPF deep dive?",
    )
    fireEvent.click(within(question).getByRole('button', { name: 'Delete' }))
    expect(onDeleteSignup).toHaveBeenCalledWith('s-2', 'Eve Example')
  })

  // The last flagged person deleted from the open list: the Flagged button
  // that opened it is gone, so closing the list must not leave focus on
  // nothing. It goes to the panel's heading.
  it('puts focus on the heading when the button that opened the list is gone', async () => {
    const actions = {
      onRetry: vi.fn(),
      onMoveToWaitlist: vi.fn(),
      onDeleteSignup: vi.fn(),
    }
    const { rerender } = render(<TicketHolderPanel view={READY} {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Flagged, 1' }))
    screen.getByRole('dialog', { name: 'Flagged sign-ups' })

    rerender(<TicketHolderPanel view={ready({ flagged: [] })} {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))

    const heading = screen.getByRole('heading', { name: 'Ticket holders' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })

  // A refresh that fails while the list is open: the list closes (focus to
  // the heading, as the Flagged button is gone), and the next good read does
  // not open it again by itself.
  it('closes the list when the numbers become unavailable, and does not reopen it', async () => {
    const actions = {
      onRetry: vi.fn(),
      onMoveToWaitlist: vi.fn(),
      onDeleteSignup: vi.fn(),
    }
    const { rerender } = render(<TicketHolderPanel view={READY} {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Flagged, 1' }))
    screen.getByRole('dialog', { name: 'Flagged sign-ups' })

    rerender(
      <TicketHolderPanel
        view={{ state: 'unavailable', retrying: false }}
        {...actions}
      />,
    )
    const heading = screen.getByRole('heading', { name: 'Ticket holders' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(screen.queryByRole('dialog')).toBeNull()

    rerender(<TicketHolderPanel view={READY} {...actions} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Flagged, 1' })).toBeTruthy()
  })

  // After a move or a delete the list still shows the sign-up until the
  // re-read lands: acting on it again would only be refused (NOT_FOUND) or
  // move someone already moved.
  it('offers no action while the numbers are being read again', () => {
    render(
      <TicketHolderPanel
        view={READY}
        isRefreshing
        onRetry={vi.fn()}
        onMoveToWaitlist={vi.fn()}
        onDeleteSignup={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Flagged, 1' }))
    const table = within(
      screen.getByRole('dialog', { name: 'Flagged sign-ups' }),
    ).getByRole('table')
    const actions = [
      ...within(table).getAllByRole('button', { name: 'Move to waitlist' }),
      ...within(table).getAllByTitle('Delete participant'),
    ]
    expect(actions).toHaveLength(3)
    for (const action of actions) expect(action).toBeDisabled()
  })

  // TENANCY: a question asked in the list does not outlive it. The numbers
  // go (the conference changed) while "Delete signup" is open; when the list
  // is opened again, for whoever is flagged now, no old question comes back
  // with the old person's name and sign-up.
  it('asks no question left over from an earlier opening', async () => {
    const actions = {
      onRetry: vi.fn(),
      onMoveToWaitlist: vi.fn(),
      onDeleteSignup: vi.fn(),
    }
    const { rerender } = render(<TicketHolderPanel view={READY} {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Flagged, 1' }))
    const table = within(
      screen.getByRole('dialog', { name: 'Flagged sign-ups' }),
    ).getByRole('table')
    fireEvent.click(within(table).getAllByTitle('Delete participant')[0])
    screen.getByRole('dialog', { name: 'Delete signup' })

    rerender(<TicketHolderPanel view={{ state: 'loading' }} {...actions} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const other = {
      email: 'zoe@x.test',
      name: 'Zoe Other',
      signups: [
        {
          _id: 's-9',
          userEmail: 'zoe@x.test',
          userName: 'Zoe Other',
          status: 'waitlist' as const,
          workshop: { _id: 'w-9', title: 'Another workshop' },
        },
      ],
    }
    rerender(
      <TicketHolderPanel view={ready({ flagged: [other] })} {...actions} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Flagged, 1' }))
    await screen.findByRole('dialog', { name: 'Flagged sign-ups' })
    expect(screen.queryByRole('dialog', { name: 'Delete signup' })).toBeNull()
    expect(screen.queryByText(/Eve Example/)).toBeNull()
  })

  it('with nobody flagged, Flagged is a number and opens nothing', () => {
    renderPanel(ready({ flagged: [] }))
    expect(valueOf('Flagged')).toBe('0')
    expect(screen.queryByRole('button', { name: /Flagged/ })).toBeNull()
  })
})
