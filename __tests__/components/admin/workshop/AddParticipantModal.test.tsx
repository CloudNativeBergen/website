/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AddParticipantModal } from '@/components/admin/workshop/AddParticipantModal'

afterEach(() => cleanup())

describe('AddParticipantModal (C1)', () => {
  it('shows an inline validation error (not a native alert) when required fields are empty', () => {
    const onSubmit = vi.fn()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(
      <AddParticipantModal
        isOpen
        onClose={vi.fn()}
        workshopTitle="Kubernetes 101"
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Participant' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(
      screen.getByText('Please fill in both name and email.'),
    ).toBeInTheDocument()
    alertSpy.mockRestore()
  })

  it('keeps the typed values after submit so a failed parent mutation loses nothing', () => {
    const onSubmit = vi.fn()
    render(
      <AddParticipantModal
        isOpen
        onClose={vi.fn()}
        workshopTitle="Kubernetes 101"
        onSubmit={onSubmit}
      />,
    )

    const name = screen.getByPlaceholderText('John Doe') as HTMLInputElement
    const email = screen.getByPlaceholderText(
      'john@example.com',
    ) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(email, { target: { value: 'ada@example.com' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add Participant' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: 'Ada Lovelace',
        userEmail: 'ada@example.com',
      }),
    )
    // The modal stays open (parent controls close on success); inputs are NOT
    // reset synchronously, so a rejected mutation preserves the entered data.
    expect(name.value).toBe('Ada Lovelace')
    expect(email.value).toBe('ada@example.com')
  })

  it('resets the form the next time it opens (success is signalled by a re-open)', () => {
    const { rerender } = render(
      <AddParticipantModal
        isOpen
        onClose={vi.fn()}
        workshopTitle="Kubernetes 101"
        onSubmit={vi.fn()}
      />,
    )

    const name = screen.getByPlaceholderText('John Doe') as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    expect(name.value).toBe('Ada Lovelace')

    // Close then reopen — the reset-on-open effect clears the previous entry.
    rerender(
      <AddParticipantModal
        isOpen={false}
        onClose={vi.fn()}
        workshopTitle="Kubernetes 101"
        onSubmit={vi.fn()}
      />,
    )
    rerender(
      <AddParticipantModal
        isOpen
        onClose={vi.fn()}
        workshopTitle="Kubernetes 101"
        onSubmit={vi.fn()}
      />,
    )

    expect(
      (screen.getByPlaceholderText('John Doe') as HTMLInputElement).value,
    ).toBe('')
  })
})
