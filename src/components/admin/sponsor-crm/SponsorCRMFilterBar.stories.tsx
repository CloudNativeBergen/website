import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SponsorCRMFilterBar } from './SponsorCRMFilterBar'
import type { SponsorTier } from '@/lib/sponsor/types'

const mockTiers: SponsorTier[] = [
  {
    _id: 'tier-1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    title: 'Platinum',
    tagline: 'Premium sponsorship tier',
    tierType: 'standard',
    price: [{ _key: 'nok', amount: 50000, currency: 'NOK' }],
    soldOut: false,
    mostPopular: false,
  },
  {
    _id: 'tier-2',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    title: 'Gold',
    tagline: 'Gold sponsorship tier',
    tierType: 'standard',
    price: [{ _key: 'nok', amount: 25000, currency: 'NOK' }],
    soldOut: false,
    mostPopular: true,
  },
  {
    _id: 'tier-3',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    title: 'Silver',
    tagline: 'Silver sponsorship tier',
    tierType: 'standard',
    price: [{ _key: 'nok', amount: 10000, currency: 'NOK' }],
    soldOut: false,
    mostPopular: false,
  },
]

const mockOrganizers = [
  { _id: 'org-1', name: 'Alice Johnson', email: 'alice@example.com' },
  { _id: 'org-2', name: 'Bob Smith', email: 'bob@example.com' },
  { _id: 'org-3', name: 'Carol Williams', email: 'carol@example.com' },
]

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorCRMFilterBar',
  component: SponsorCRMFilterBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Filter toolbar for the sponsor pipeline. Provides search input, tier and organizer dropdowns, view mode toggle (board/list), and active filter chips with clear-all action.',
      },
    },
  },
  args: {
    currentView: 'pipeline',
    onViewChange: fn(),
    searchQuery: '',
    onSearchChange: fn(),
    tiers: mockTiers,
    tiersFilter: [],
    onToggleTier: fn(),
    organizers: mockOrganizers,
    assignedToFilter: undefined,
    onSetOrganizer: fn(),
    tagsFilter: [],
    onToggleTag: fn(),
    onClearAllFilters: fn(),
    selectedCount: 0,
    onSelectAll: fn(),
    onClearSelection: fn(),
    isMobileSearchOpen: false,
    onToggleMobileSearch: fn(),
    onOpenMobileFilter: fn(),
  },
  decorators: [
    (Story) => (
      <div className="min-w-200">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SponsorCRMFilterBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}

export const WithSearch: Story = {
  args: {
    searchQuery: 'Google',
  },
}

export const WithTierFilter: Story = {
  args: {
    tiersFilter: ['tier-1', 'tier-2'],
  },
}

export const WithOwnerFilter: Story = {
  args: {
    assignedToFilter: 'org-1',
  },
}

export const WithUnassignedFilter: Story = {
  args: {
    assignedToFilter: 'unassigned',
  },
}

export const WithTagsFilter: Story = {
  args: {
    tagsFilter: ['returning-sponsor', 'high-priority'],
  },
}

export const WithMultipleFilters: Story = {
  args: {
    searchQuery: 'Tech',
    tiersFilter: ['tier-1'],
    assignedToFilter: 'org-2',
    tagsFilter: ['returning-sponsor'],
  },
}

export const WithSelection: Story = {
  args: {
    selectedCount: 5,
  },
}

export const ContractView: Story = {
  args: {
    currentView: 'contract',
  },
}

export const InvoiceView: Story = {
  args: {
    currentView: 'invoice',
  },
}

export const MobileSearchOpen: Story = {
  args: {
    isMobileSearchOpen: true,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
}

export const NoTiers: Story = {
  args: {
    tiers: [],
  },
}
