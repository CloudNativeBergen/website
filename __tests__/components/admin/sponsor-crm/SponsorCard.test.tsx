/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import { SponsorCard } from '@/components/admin/sponsor-crm/SponsorCard'

// jsdom ships no ResizeObserver; Headless UI's Menu observes its anchor when
// the panel opens.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

describe('SponsorCard — options menu', () => {
  afterEach(cleanup)

  /**
   * Regression: the menu wrapper stopped `pointerdown` (so the card can't be
   * dragged by its menu) but not `click`, which bubbled to the card root and
   * opened the sponsor modal on top of the menu that had just opened.
   */
  it('opens the menu without opening the sponsor', () => {
    const onEdit = vi.fn()
    render(
      <SponsorCard
        sponsor={mockSponsor()}
        currentView="pipeline"
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open options' }))

    expect(onEdit).not.toHaveBeenCalled()
    expect(
      screen.getByRole('menuitem', { name: 'Edit Details' }),
    ).toBeInTheDocument()
  })

  it('still opens the sponsor when the card body is clicked', () => {
    const onEdit = vi.fn()
    render(
      <SponsorCard
        sponsor={mockSponsor()}
        currentView="pipeline"
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Acme Corporation'))

    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('runs a menu item without also opening the sponsor', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <SponsorCard
        sponsor={mockSponsor()}
        currentView="pipeline"
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onEdit).not.toHaveBeenCalled()
  })
})
