/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { ErasurePreview } from './ErasurePreview'
import { sharedSpeakerPreview } from './fixtures'

describe('ErasurePreview confirm step', () => {
  it('erases only once the email is typed exactly', () => {
    const onErase = vi.fn()
    render(<ErasurePreview preview={sharedSpeakerPreview} onErase={onErase} />)
    const button = screen.getByRole('button', { name: 'Erase' })
    const input = screen.getByLabelText(/to confirm/)

    fireEvent.change(input, { target: { value: 'ada@example.org' } })
    expect(button).toBeDisabled()

    fireEvent.change(input, { target: { value: 'Ada@Example.com' } })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(onErase).toHaveBeenCalledWith('Ada@Example.com')
  })

  it('offers no erase when the plan is refused', () => {
    render(
      <ErasurePreview
        preview={{ ...sharedSpeakerPreview, refusals: ['sole organizer'] }}
        onErase={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Erase' })).toBeNull()
    expect(screen.getByText('sole organizer')).toBeTruthy()
  })
})
