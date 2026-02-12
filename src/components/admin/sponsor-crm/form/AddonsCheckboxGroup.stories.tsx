/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddonsCheckboxGroup } from './AddonsCheckboxGroup'
import { mockSponsorTier } from '@/__mocks__/sponsor-data'
import { useState } from 'react'

const meta: Meta<typeof AddonsCheckboxGroup> = {
  title: 'Systems/Sponsors/Admin/Form/AddonsCheckboxGroup',
  component: AddonsCheckboxGroup,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Multi-select checkbox group for sponsor addon purchases (booth space, workshop hosting, swag bags, etc.). Addon tiers have tierType="addon" and can be combined with standard tiers. Displays pricing and sold-out status for each option.',
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
type Story = StoryObj<typeof AddonsCheckboxGroup>

const mockAddons = [
  mockSponsorTier({
    _id: 'addon-booth',
    title: 'Exhibition Booth',
    tierType: 'addon',
    price: [{ _key: 'price-1', amount: 15000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'addon-workshop',
    title: 'Workshop Slot',
    tierType: 'addon',
    price: [{ _key: 'price-2', amount: 10000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'addon-swag',
    title: 'Swag Bag Insert',
    tierType: 'addon',
    price: [{ _key: 'price-3', amount: 5000, currency: 'NOK' }],
  }),
]

export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['addon-booth'])
    return (
      <AddonsCheckboxGroup
        addons={mockAddons}
        value={value}
        onChange={setValue}
      />
    )
  },
}

export const NoAddons: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([])
    return (
      <AddonsCheckboxGroup
        addons={mockAddons}
        value={value}
        onChange={setValue}
      />
    )
  },
}

export const SomeSelected: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['addon-booth', 'addon-swag'])
    return (
      <AddonsCheckboxGroup
        addons={mockAddons}
        value={value}
        onChange={setValue}
      />
    )
  },
}

export const AllSelected: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([
      'addon-booth',
      'addon-workshop',
      'addon-swag',
    ])
    return (
      <AddonsCheckboxGroup
        addons={mockAddons}
        value={value}
        onChange={setValue}
      />
    )
  },
}

export const ManyAddons: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['addon-booth'])
    const manyAddons = [
      ...mockAddons,
      mockSponsorTier({
        _id: 'addon-logo',
        title: 'Logo on Lanyard',
        tierType: 'addon',
      }),
      mockSponsorTier({
        _id: 'addon-social',
        title: 'Social Media Post',
        tierType: 'addon',
      }),
      mockSponsorTier({
        _id: 'addon-banner',
        title: 'Banner Placement',
        tierType: 'addon',
      }),
    ]
    return (
      <AddonsCheckboxGroup
        addons={manyAddons}
        value={value}
        onChange={setValue}
      />
    )
  },
}
