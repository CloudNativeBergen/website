/**
 * @vitest-environment jsdom
 *
 * The attendee's cancel asks first (#1331). A cancel deletes the sign-up and
 * nobody can restore it: before, one click moved the attendee to the waitlist
 * and an organizer could put them back. The question says in plain words what
 * is given up (the seat, or the place in line) and, when registration has
 * closed, that there is no signing up again. While registration is open it
 * promises nothing about a seat still being there.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import WorkshopCard from './WorkshopCard'
import { TAP_GUARD_MS } from '@/hooks/useOpenedLongEnough'
import type {
  ProposalWithWorkshopData,
  WorkshopSignupExisting,
} from '@/lib/workshop/types'

const workshop = {
  _id: 'ws-1',
  title: 'Kubernetes 101',
  format: 'workshop_120',
  capacity: 30,
  signups: 12,
  available: 18,
  waitlistCount: 0,
  speakers: [],
  topics: [],
} as unknown as ProposalWithWorkshopData

const signup = (status: 'confirmed' | 'waitlist') =>
  [
    {
      _id: 'signup-1',
      _type: 'workshopSignup',
      status,
      workshop: { _type: 'reference', _ref: 'ws-1' },
    },
  ] as unknown as WorkshopSignupExisting[]

function renderCard(
  status: 'confirmed' | 'waitlist',
  registrationClosed: boolean,
) {
  const onCancel = vi.fn(async () => ({ success: true }))
  render(
    <WorkshopCard
      workshop={workshop}
      userSignups={signup(status)}
      onSignup={vi.fn()}
      onCancel={onCancel}
      isSignedUp
      registrationClosed={registrationClosed}
    />,
  )
  return { onCancel }
}

/** The question ignores its confirm button for a moment after it opens. */
const aMomentLater = (ms = TAP_GUARD_MS) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the question before an attendee’s cancel', () => {
  it.each([
    [
      'confirmed',
      false,
      'Cancel Registration',
      'Cancel your registration?',
      'You give up your seat in Kubernetes 101. You can register again while registration is open, but the seat may be taken by then.',
    ],
    [
      'confirmed',
      true,
      'Cancel Registration',
      'Cancel your registration?',
      'You give up your seat in Kubernetes 101. Registration has closed, so you will not be able to register again.',
    ],
    [
      'waitlist',
      false,
      'Leave Waitlist',
      'Leave the waitlist?',
      'You give up your place in line for Kubernetes 101. You can join again while registration is open, but you lose the place you have now.',
    ],
    [
      'waitlist',
      true,
      'Leave Waitlist',
      'Leave the waitlist?',
      'You give up your place in line for Kubernetes 101. Registration has closed, so you will not be able to join again.',
    ],
  ] as const)(
    '%s, registration closed: %s',
    (status, closed, button, title, words) => {
      const { onCancel } = renderCard(status, closed)

      fireEvent.click(screen.getByRole('button', { name: button }))

      // Asked, not done.
      expect(onCancel).not.toHaveBeenCalled()
      const question = screen.getByRole('dialog', { name: title })
      expect(question).toHaveTextContent(words)

      aMomentLater()
      fireEvent.click(within(question).getByRole('button', { name: button }))

      expect(onCancel).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    ['confirmed', 'Cancel Registration', 'Keep My Seat'],
    ['waitlist', 'Leave Waitlist', 'Stay on Waitlist'],
  ] as const)('%s: backing out keeps the sign-up', (status, button, keep) => {
    const { onCancel } = renderCard(status, false)
    fireEvent.click(screen.getByRole('button', { name: button }))
    aMomentLater()

    fireEvent.click(screen.getByRole('button', { name: keep }))

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('a second tap does not answer it: ignored inside the moment, obeyed after it', () => {
    const { onCancel } = renderCard('confirmed', true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Registration' }))
    const confirm = () =>
      within(
        screen.getByRole('dialog', { name: 'Cancel your registration?' }),
      ).getByRole('button', { name: 'Cancel Registration' })

    fireEvent.click(confirm())
    aMomentLater(TAP_GUARD_MS - 1)
    fireEvent.click(confirm())

    expect(onCancel).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: 'Cancel your registration?' }),
    ).toHaveTextContent('You give up your seat')

    aMomentLater(1)
    fireEvent.click(confirm())

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
