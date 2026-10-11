/**
 * @vitest-environment jsdom
 *
 * "Sign Out" cannot be pressed twice: the second press would find no session
 * and skip the step that ends the WorkOS login (#1315).
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkshopSignOutButton } from './WorkshopSignOutButton'

describe('WorkshopSignOutButton', () => {
  it('is disabled from the press until the action answers', async () => {
    let answer: () => void = () => {}
    const action = vi.fn(
      () => new Promise<void>((resolve) => (answer = resolve)),
    )
    render(<WorkshopSignOutButton action={action} />)
    const button = screen.getByRole('button', { name: 'Sign Out' })
    expect(button).toBeEnabled()

    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button)

    expect(action).toHaveBeenCalledTimes(1)
    answer()
    await waitFor(() => expect(button).toBeEnabled())
  })
})
