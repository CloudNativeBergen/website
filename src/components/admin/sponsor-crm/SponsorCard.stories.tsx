import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorCard } from './SponsorCard'
import { mockSponsors, mockSponsor } from '@/__mocks__/sponsor-data'
import { DndContext } from '@dnd-kit/core'

const meta: Meta<typeof SponsorCard> = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorCard',
  component: SponsorCard,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Visual representation of sponsors in the CRM pipeline. Each card displays sponsor information, current status, contract value, and available actions. Cards support drag-and-drop for pipeline management and adapt their layout based on the current view (pipeline, contract, or invoice board). The design follows Nordic minimalism principles with clear status indicators using the brand color system.',
      },
    },
  },
  argTypes: {
    currentView: {
      control: 'select',
      options: ['pipeline', 'contract', 'invoice'],
      description:
        'Current board view affects card layout and displayed information',
    },
    isSelected: {
      control: 'boolean',
      description: 'Whether the card is selected for bulk actions',
    },
  },
  decorators: [
    (Story) => (
      <DndContext>
        <div className="max-w-sm p-8">
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SponsorCard>

export const Interactive: Story = {
  args: {
    sponsor: mockSponsors.negotiating,
    currentView: 'pipeline',
    onEdit: () => console.log('Edit clicked'),
    onDelete: () => console.log('Delete clicked'),
    onEmail: () => console.log('Email clicked'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive playground - use controls to change view type, selection state, and other properties.',
      },
    },
  },
}

export const Prospect: Story = {
  args: {
    sponsor: mockSponsors.prospect,
    currentView: 'pipeline',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const Contacted: Story = {
  args: {
    sponsor: mockSponsors.contacted,
    currentView: 'pipeline',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const Negotiating: Story = {
  args: {
    sponsor: mockSponsors.negotiating,
    currentView: 'pipeline',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const ClosedWon: Story = {
  args: {
    sponsor: mockSponsors.closedWon,
    currentView: 'pipeline',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const ClosedLost: Story = {
  args: {
    sponsor: mockSponsors.closedLost,
    currentView: 'pipeline',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const PipelineView: Story = {
  args: {
    sponsor: mockSponsors.negotiating,
    currentView: 'pipeline',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const ContractView: Story = {
  args: {
    sponsor: mockSponsor({
      status: 'closed-won',
      contractStatus: 'contract-sent',
    }),
    currentView: 'contract',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const InvoiceView: Story = {
  args: {
    sponsor: mockSponsor({
      status: 'closed-won',
      contractStatus: 'contract-signed',
      invoiceStatus: 'sent',
    }),
    currentView: 'invoice',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const WithAssignee: Story = {
  args: {
    sponsor: mockSponsor({
      assignedTo: {
        _id: 'speaker-1',
        name: 'John Doe',
        email: 'john@example.com',
      },
    }),
    currentView: 'pipeline',
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const Selected: Story = {
  args: {
    sponsor: mockSponsors.negotiating,
    currentView: 'pipeline',
    isSelected: true,
    isSelectionMode: true,
    onToggleSelect: (e) => console.log('Toggle', e),
    onEdit: () => {},
    onDelete: () => {},
  },
}

export const NoLogo: Story = {
  args: {
    sponsor: mockSponsor({
      sponsor: {
        ...mockSponsors.negotiating.sponsor,
        logo: '',
        logoBright: '',
      },
    }),
    currentView: 'pipeline',
    onEdit: () => console.log('Edit clicked'),
    onDelete: () => console.log('Delete clicked'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Edge case: Sponsor without logo displays fallback name initials.',
      },
    },
  },
}

export const HighValue: Story = {
  args: {
    sponsor: mockSponsor({
      contractValue: 2500000,
      contractCurrency: 'NOK',
      status: 'negotiating',
      tags: ['high-priority', 'multi-year-potential'],
    }),
    currentView: 'pipeline',
    onEdit: () => console.log('Edit clicked'),
    onDelete: () => console.log('Delete clicked'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Edge case: High-value sponsor with large contract value and priority tags.',
      },
    },
  },
}
