/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
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
  render(
    <SignupDetailsModal
      isOpen
      onClose={vi.fn()}
      workshopTitle="Kubernetes 101"
      status={WorkshopSignupStatus.CONFIRMED}
      signups={signups}
      onConfirmSignup={vi.fn()}
      onDeleteSignup={onDeleteSignup}
      {...overrides}
    />,
  )
  return { onDeleteSignup }
}

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
