/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { TierPickerPrompt } from '@/components/admin/sponsor-crm/TierPickerPrompt'
import type { SponsorTier } from '@/lib/sponsor/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

// The modal chrome (animation, focus trap, theming) is a boundary; render its
// children directly so the test can exercise the picker's own behaviour.
vi.mock('@/components/ModalShell', () => ({
  ModalShell: ({
    isOpen,
    children,
  }: {
    isOpen: boolean
    children: React.ReactNode
  }) => (isOpen ? <div>{children}</div> : null),
}))

const tiers = [
  { _id: 'tier-bronze', title: 'Bronze' },
  { _id: 'tier-gold', title: 'Gold' },
] as unknown as SponsorTier[]

const sponsor = {
  _id: 'spc-1',
  sponsor: { name: 'Acme' },
} as unknown as SponsorForConferenceExpanded

describe('TierPickerPrompt', () => {
  it('offers a button for each tier', () => {
    render(
      <TierPickerPrompt
        sponsor={sponsor}
        tiers={tiers}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Bronze' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gold' })).toBeInTheDocument()
  })

  it('completes the move with the chosen tier in one click', () => {
    const onSelect = vi.fn()
    render(
      <TierPickerPrompt
        sponsor={sponsor}
        tiers={tiers}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Gold' }))

    expect(onSelect).toHaveBeenCalledWith('tier-gold')
  })

  it('cancels without selecting a tier', () => {
    const onCancel = vi.fn()
    render(
      <TierPickerPrompt
        sponsor={sponsor}
        tiers={tiers}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when there is no pending sponsor', () => {
    const { container } = render(
      <TierPickerPrompt
        sponsor={null}
        tiers={tiers}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
