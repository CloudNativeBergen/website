/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import {
  BoardViewSwitcher,
  type BoardView,
} from '@/components/admin/sponsor-crm/BoardViewSwitcher'

describe('BoardViewSwitcher', () => {
  const setup = (currentView: BoardView = 'pipeline') => {
    const onViewChange = vi.fn<(view: BoardView) => void>()
    const result = render(
      <BoardViewSwitcher
        currentView={currentView}
        onViewChange={onViewChange}
      />,
    )
    return { onViewChange, ...result }
  }

  it('renders all three view buttons with labels', () => {
    setup()
    expect(screen.getByText('Full Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Contract Board')).toBeInTheDocument()
    expect(screen.getByText('Invoice Board')).toBeInTheDocument()
  })

  it('calls onViewChange when clicking a different view', () => {
    const { onViewChange } = setup('pipeline')
    const buttons = screen.getAllByRole('button')

    // Click the contract button (second one)
    fireEvent.click(buttons[1])
    expect(onViewChange).toHaveBeenCalledWith('contract')

    // Click the invoice button (third one)
    fireEvent.click(buttons[2])
    expect(onViewChange).toHaveBeenCalledWith('invoice')
  })

  it('calls onViewChange when clicking the current view', () => {
    const { onViewChange } = setup('pipeline')
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(onViewChange).toHaveBeenCalledWith('pipeline')
  })

  it('renders three buttons for the three views', () => {
    setup()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
  })
})
