/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TierRadioGroup } from './TierRadioGroup'
import { mockSponsorTier } from '@/__mocks__/sponsor-data'
import { useState } from 'react'

const meta: Meta<typeof TierRadioGroup> = {
  title: 'Admin/Sponsors/Form/TierRadioGroup',
  component: TierRadioGroup,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Radio button group for selecting sponsor tiers (e.g., Ingress, Service, Pod). Each tier displays pricing, tagline, and sold-out status. Tiers are conference-specific and define sponsor benefits and perks. The mostPopular flag highlights recommended tiers with Nordic Purple accent.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TierRadioGroup>

const mockTiers = [
  mockSponsorTier({
    _id: 'tier-ingress',
    title: 'Ingress',
    price: [{ _key: 'price-1', amount: 100000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'tier-service',
    title: 'Service',
    price: [{ _key: 'price-2', amount: 50000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'tier-pod',
    title: 'Pod',
    price: [{ _key: 'price-3', amount: 25000, currency: 'NOK' }],
  }),
]

export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState<string>('tier-ingress')
    return (
      <TierRadioGroup tiers={mockTiers} value={value} onChange={setValue} />
    )
  },
}

export const MultipleTiers: Story = {
  render: () => {
    const [value, setValue] = useState<string>('tier-ingress')
    return (
      <TierRadioGroup tiers={mockTiers} value={value} onChange={setValue} />
    )
  },
}

export const NoTier: Story = {
  render: () => {
    const [value, setValue] = useState<string>('')
    return (
      <TierRadioGroup tiers={mockTiers} value={value} onChange={setValue} />
    )
  },
}

export const SingleTier: Story = {
  render: () => {
    const [value, setValue] = useState<string>('')
    return (
      <TierRadioGroup
        tiers={[mockSponsorTier({ _id: 'tier-ingress', title: 'Ingress' })]}
        value={value}
        onChange={setValue}
      />
    )
  },
}

export const ManyTiers: Story = {
  render: () => {
    const [value, setValue] = useState<string>('tier-service')
    const manyTiers = [
      ...mockTiers,
      mockSponsorTier({ _id: 'tier-deployment', title: 'Deployment' }),
      mockSponsorTier({ _id: 'tier-namespace', title: 'Namespace' }),
    ]
    return (
      <TierRadioGroup tiers={manyTiers} value={value} onChange={setValue} />
    )
  },
}
