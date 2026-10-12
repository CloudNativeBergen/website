/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from '@testing-library/react'
import { SignupDetailsModal } from '@/components/admin/workshop/SignupDetailsModal'
import {
  WorkshopSignupStatus,
  type WorkshopSignupExisting,
} from '@/lib/workshop/types'

const signups = [
  {
    _id: 'signup-1',
    _type: 'workshopSignup',
    userName: 'Ada Lovelace',
    userEmail: 'ada@example.com',
    status: WorkshopSignupStatus.CONFIRMED,
    signedUpAt: '2025-01-10T08:00:00Z',
    _createdAt: '2025-01-10T08:00:00Z',
  },
] as unknown as WorkshopSignupExisting[]

function renderModal(
  overrides: Partial<React.ComponentProps<typeof SignupDetailsModal>> = {},
) {
  const onDeleteSignup = vi.fn()
  const onMoveToWaitlist = vi.fn()
  const onConfirmSignup = vi.fn()
  render(
    <SignupDetailsModal
      isOpen
      onClose={vi.fn()}
      workshopTitle="Kubernetes 101"
      status={WorkshopSignupStatus.CONFIRMED}
      signups={signups}
      onConfirmSignup={onConfirmSignup}
      onMoveToWaitlist={onMoveToWaitlist}
      onDeleteSignup={onDeleteSignup}
      {...overrides}
    />,
  )
  return { onDeleteSignup, onMoveToWaitlist, onConfirmSignup }
}

const waitlisted = [
  { ...signups[0], _id: 'signup-2', status: WorkshopSignupStatus.WAITLIST },
] as unknown as WorkshopSignupExisting[]

// The list renders every row twice (a card below `md`, a table row above), so
// each action is in the document twice.
const moveToWaitlist = () =>
  screen.queryAllByRole('button', { name: 'Move to waitlist' })

afterEach(() => cleanup())

describe('SignupDetailsModal delete confirmation (C6)', () => {
  it('does not delete immediately — it opens a confirmation naming the participant', () => {
    const { onDeleteSignup } = renderModal()

    fireEvent.click(screen.getAllByTitle('Delete participant')[0])

    expect(onDeleteSignup).not.toHaveBeenCalled()
    expect(
      screen.getByText(/permanently delete Ada Lovelace's signup/i),
    ).toBeInTheDocument()
  })

  it('routes the delete through the confirmation modal', () => {
    const { onDeleteSignup } = renderModal()

    fireEvent.click(screen.getAllByTitle('Delete participant')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDeleteSignup).toHaveBeenCalledWith('signup-1', 'Ada Lovelace')
  })

  it('cancelling the confirmation leaves the signup untouched', () => {
    const { onDeleteSignup } = renderModal()

    fireEvent.click(screen.getAllByTitle('Delete participant')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDeleteSignup).not.toHaveBeenCalled()
  })
})

describe('SignupDetailsModal "Move to waitlist" (#1331)', () => {
  it('is offered on a confirmed sign-up, where "Move to Confirmed" is not', () => {
    renderModal()

    expect(moveToWaitlist()).toHaveLength(2)
    expect(
      screen.queryAllByRole('button', { name: 'Move to Confirmed' }),
    ).toHaveLength(0)
  })

  it('is not offered on a waitlisted sign-up, where "Move to Confirmed" is', () => {
    renderModal({ status: WorkshopSignupStatus.WAITLIST, signups: waitlisted })

    expect(moveToWaitlist()).toHaveLength(0)
    expect(
      screen.queryAllByRole('button', { name: 'Move to Confirmed' }),
    ).toHaveLength(2)
  })

  it('asks first, naming the participant and saying they are not emailed', () => {
    const { onMoveToWaitlist } = renderModal()

    fireEvent.click(moveToWaitlist()[0])

    expect(onMoveToWaitlist).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Move to waitlist' })
    expect(dialog).toHaveTextContent(
      'Move Ada Lovelace to the waitlist for Kubernetes 101?',
    )
    // The whole of it, in this order. Both "They" sentences come straight
    // after the name, so neither can be read as "whoever signs up next". That
    // the person stays in line is proven in `workshop.cancel.test.ts`.
    expect(dialog).toHaveTextContent(
      'Move Ada Lovelace to the waitlist for Kubernetes 101? They lose their seat and get no email about it. They stay in line by sign-up date, so a capacity increase can seat them again. The seat is open to whoever signs up next.',
    )
  })

  it('moves that sign-up once the organizer confirms', () => {
    const { onMoveToWaitlist, onDeleteSignup } = renderModal()

    fireEvent.click(moveToWaitlist()[0])
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Move to waitlist' }),
      ).getByRole('button', { name: 'Move to waitlist' }),
    )

    expect(onMoveToWaitlist).toHaveBeenCalledTimes(1)
    expect(onMoveToWaitlist).toHaveBeenCalledWith('signup-1', 'Ada Lovelace')
    expect(onDeleteSignup).not.toHaveBeenCalled()
  })

  it('backing out of the question leaves the sign-up confirmed', () => {
    const { onMoveToWaitlist } = renderModal()

    fireEvent.click(moveToWaitlist()[0])
    fireEvent.click(screen.getByRole('button', { name: 'Keep confirmed' }))

    expect(onMoveToWaitlist).not.toHaveBeenCalled()
  })

  it('never calls the action "cancel"', () => {
    renderModal()
    fireEvent.click(moveToWaitlist()[0])

    // The question is open and showing its own text, with both its buttons:
    // only then does "no cancel anywhere" say anything about it.
    const question = screen.getByRole('dialog', { name: 'Move to waitlist' })
    expect(question).toHaveTextContent(
      'Move Ada Lovelace to the waitlist for Kubernetes 101?',
    )
    expect(within(question).getAllByRole('button')).toHaveLength(2)
    expect(document.body).not.toHaveTextContent(/cancel/i)
  })
})
