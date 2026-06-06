import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { TierPickerPrompt } from './TierPickerPrompt'
import { mockSponsor, mockSponsorTier } from '@/__mocks__/sponsor-data'

const regularTiers = [
  mockSponsorTier({
    _id: 'tier-ingress',
    title: 'Ingress',
    price: [{ _key: 'p1', amount: 100000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'tier-service',
    title: 'Service',
    price: [{ _key: 'p2', amount: 50000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'tier-pod',
    title: 'Pod',
    price: [{ _key: 'p3', amount: 25000, currency: 'NOK' }],
  }),
]

const addonTier = mockSponsorTier({
  _id: 'tier-booth',
  title: 'Booth upgrade',
  tierType: 'addon',
})

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/TierPickerPrompt',
  component: TierPickerPrompt,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Guided completion shown when a tierless sponsor is dragged to `closed-won`. Untiered sponsors are hidden from the public site, so the move is held until a tier is picked — clicking a tier completes the move in one step; Cancel (or Escape/backdrop) leaves the sponsor in its original stage. Addon tiers are excluded since they cannot be a sponsor’s primary tier.',
      },
    },
  },
  args: {
    sponsor: mockSponsor({}),
    tiers: regularTiers,
    onSelect: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof TierPickerPrompt>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ManyTiers: Story = {
  args: {
    tiers: [
      ...regularTiers,
      mockSponsorTier({ _id: 'tier-deployment', title: 'Deployment' }),
      mockSponsorTier({ _id: 'tier-namespace', title: 'Namespace' }),
      mockSponsorTier({
        _id: 'tier-community',
        title: 'Community Supporter (in-kind)',
      }),
    ],
  },
}

export const ExcludesAddonTiers: Story = {
  args: {
    tiers: [...regularTiers, addonTier],
  },
  play: async () => {
    // Standard tiers are offered, addon tiers are not — an addon must never
    // become a sponsor's primary tier.
    await expect(
      screen.getByRole('button', { name: 'Ingress' }),
    ).toBeInTheDocument()
    await expect(
      screen.queryByRole('button', { name: 'Booth upgrade' }),
    ).not.toBeInTheDocument()
  },
}

export const NoSelectableTiers: Story = {
  args: {
    // Only addon tiers configured: nothing selectable, so the guidance shows.
    tiers: [addonTier],
  },
  play: async () => {
    await expect(screen.getByText(/no tiers are configured/i)).toBeVisible()
    await expect(
      screen.queryByRole('button', { name: 'Booth upgrade' }),
    ).not.toBeInTheDocument()
  },
}

export const SelectingTierCompletesMove: Story = {
  play: async ({ args }) => {
    await userEvent.click(screen.getByRole('button', { name: 'Service' }))
    await expect(args.onSelect).toHaveBeenCalledWith('tier-service')
  },
}

export const CancelLeavesSponsorPut: Story = {
  play: async ({ args }) => {
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancel).toHaveBeenCalledTimes(1)
  },
}

export const Closed: Story = {
  args: {
    sponsor: null,
  },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
