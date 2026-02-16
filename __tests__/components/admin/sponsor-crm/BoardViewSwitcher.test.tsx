/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'

import {
  BoardViewSwitcher,
  type BoardView,
} from '@/components/admin/sponsor-crm/BoardViewSwitcher'

describe('BoardViewSwitcher', () => {
  const setup = (currentView: BoardView = 'pipeline') => {
    const onViewChange = vi.fn<(view: BoardView) => void>()
    render(
      <BoardViewSwitcher
        currentView={currentView}
        onViewChange={onViewChange}
      />,
    )
    return { onViewChange }
  }

  it('renders all three view buttons', () => {
    setup()
    expect(screen.getByText('Full Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Contract Board')).toBeInTheDocument()
    expect(screen.getByText('Invoice Board')).toBeInTheDocument()
  })

  it('calls onViewChange with contract when clicking Contract Board', () => {
    const { onViewChange } = setup('pipeline')
    fireEvent.click(screen.getByText('Contract Board'))
    expect(onViewChange).toHaveBeenCalledWith('contract')
  })

  it('calls onViewChange with invoice when clicking Invoice Board', () => {
    const { onViewChange } = setup('pipeline')
    fireEvent.click(screen.getByText('Invoice Board'))
    expect(onViewChange).toHaveBeenCalledWith('invoice')
  })

  it('calls onViewChange with pipeline when clicking Full Pipeline', () => {
    const { onViewChange } = setup('pipeline')
    fireEvent.click(screen.getByText('Full Pipeline'))
    expect(onViewChange).toHaveBeenCalledWith('pipeline')
  })
})
