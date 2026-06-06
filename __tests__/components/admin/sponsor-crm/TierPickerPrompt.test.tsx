/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { TierPickerPrompt } from '@/components/admin/sponsor-crm/TierPickerPrompt'
import type { SponsorTier } from '@/lib/sponsor/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

// Render through the REAL ModalShell (headlessui Dialog) so the dialog's
// accessible name and Escape/backdrop dismissal are exercised, not mocked away.

const tiers = [
  { _id: 'tier-bronze', title: 'Bronze', tierType: 'standard' },
  { _id: 'tier-gold', title: 'Gold', tierType: 'standard' },
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

  it('exposes an accessible dialog name', () => {
    render(
      <TierPickerPrompt
        sponsor={sponsor}
        tiers={tiers}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Set a tier to mark as Won',
    )
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

  it('cancels on Escape (backdrop/Escape dismissal leaves the sponsor put)', () => {
    const onCancel = vi.fn()
    render(
      <TierPickerPrompt
        sponsor={sponsor}
        tiers={tiers}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not offer addon tiers as a primary tier', () => {
    const withAddon = [
      ...tiers,
      { _id: 'tier-booth', title: 'Booth upgrade', tierType: 'addon' },
    ] as unknown as SponsorTier[]
    render(
      <TierPickerPrompt
        sponsor={sponsor}
        tiers={withAddon}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Bronze' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Booth upgrade' }),
    ).not.toBeInTheDocument()
  })

  it('guides the user to Studio when no selectable tiers exist', () => {
    const onlyAddons = [
      { _id: 'tier-booth', title: 'Booth upgrade', tierType: 'addon' },
    ] as unknown as SponsorTier[]
    render(
      <TierPickerPrompt
        sponsor={sponsor}
        tiers={onlyAddons}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Booth upgrade' })).toBeNull()
    expect(screen.getByText(/no tiers are configured/i)).toBeInTheDocument()
  })

  it('renders nothing when there is no pending sponsor', () => {
    // ModalShell portals to document.body when open, so a body-scoped query —
    // not the render container — is the meaningful "closed" assertion.
    render(
      <TierPickerPrompt
        sponsor={null}
        tiers={tiers}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
