/**
 * @vitest-environment jsdom
 *
 * Saving with the assigned tasks field emptied clears them (sends null).
 */
import { describe, it, expect, vi } from 'vitest'

const { updateMutate } = vi.hoisted(() => ({ updateMutate: vi.fn() }))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({}),
    volunteer: {
      admin: {
        update: {
          useMutation: () => ({ mutate: updateMutate, isPending: false }),
        },
      },
    },
  },
}))

import { render, screen, fireEvent } from '@testing-library/react'
import { VolunteerEditModal } from '@/components/volunteer/VolunteerEditModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { VolunteerWithConference } from '@/lib/volunteer/types'

describe('VolunteerEditModal', () => {
  it('sends null when assigned tasks are emptied', () => {
    const volunteer = {
      _id: 'v1',
      name: 'Ola',
      email: 'ola@example.com',
      phone: '+4712345678',
      occupation: 'student',
      assignedTasks: ['Info desk'],
    } as unknown as VolunteerWithConference
    render(
      <NotificationProvider>
        <VolunteerEditModal isOpen onClose={() => {}} volunteer={volunteer} />
      </NotificationProvider>,
    )
    fireEvent.change(screen.getByLabelText(/Assigned tasks/), {
      target: { value: ' , ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ volunteerId: 'v1', assignedTasks: null }),
    )
  })
})
