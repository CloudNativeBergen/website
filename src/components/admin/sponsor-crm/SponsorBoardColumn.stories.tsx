import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorBoardColumn } from './SponsorBoardColumn'
import { mockSponsors, mockSponsor } from '@/__mocks__/sponsor-data'
import { DndContext } from '@dnd-kit/core'

const meta: Meta<typeof SponsorBoardColumn> = {
  title: 'Admin/Sponsors/Pipeline/SponsorBoardColumn',
  component: SponsorBoardColumn,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Kanban board column for organizing sponsors by pipeline stage. Supports drag-and-drop sponsor cards between columns to update their status. The CRM pipeline follows these stages: Prospect → Contacted → Negotiating → Closed Won/Lost. Each column shows a count badge and supports selection mode for bulk operations.',
      },
    },
  },
  decorators: [
    (Story) => (
      <DndContext>
        <div className="h-150 p-8">
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SponsorBoardColumn>

export const Interactive: Story = {
  args: {
    columnKey: 'negotiating',
    title: 'Negotiating',
    sponsors: [
      mockSponsors.negotiating,
      mockSponsor({
        _id: 'sfc-5',
        sponsor: { ...mockSponsors.negotiating.sponsor, name: 'Container Platform AS' },
        status: 'negotiating',
        contractValue: 150000,
        tags: ['high-priority', 'multi-year-potential'],
      }),
    ],
    currentView: 'pipeline',
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onSponsorEmail: (sponsor) => console.log('Email sponsor', sponsor),
    onAddClick: () => console.log('Add sponsor'),
  },
}

export const ProspectColumn: Story = {
  args: {
    columnKey: 'prospect',
    title: 'Prospect',
    sponsors: [
      mockSponsors.prospect,
      mockSponsor({
        _id: 'sfc-2',
        sponsor: { ...mockSponsors.prospect.sponsor, name: 'Tech Corp' },
        status: 'prospect',
      }),
    ],
    currentView: 'pipeline',
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onAddClick: () => console.log('Add sponsor'),
  },
}

export const ContactedColumn: Story = {
  args: {
    columnKey: 'contacted',
    title: 'Contacted',
    sponsors: [
      mockSponsors.contacted,
      mockSponsor({
        _id: 'sfc-4',
        sponsor: { ...mockSponsors.contacted.sponsor, name: 'DevOps Solutions' },
        status: 'contacted',
        tags: ['warm-lead'],
      }),
    ],
    currentView: 'pipeline',
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onSponsorEmail: (sponsor) => console.log('Email sponsor', sponsor),
    onAddClick: () => console.log('Add sponsor'),
  },
}

export const NegotiatingColumn: Story = {
  args: {
    columnKey: 'negotiating',
    title: 'Negotiating',
    sponsors: [
      mockSponsors.negotiating,
      mockSponsor({
        _id: 'sfc-5',
        sponsor: { ...mockSponsors.negotiating.sponsor, name: 'Container Platform' },
        status: 'negotiating',
        contractValue: 150000,
      }),
    ],
    currentView: 'pipeline',
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onSponsorEmail: (sponsor) => console.log('Email sponsor', sponsor),
    onAddClick: () => console.log('Add sponsor'),
  },
}

export const ContractBoard: Story = {
  args: {
    columnKey: 'contract-sent',
    title: 'Contract Sent',
    sponsors: [
      mockSponsor({
        status: 'closed-won',
        contractStatus: 'contract-sent',
        invoiceStatus: 'not-sent',
      }),
    ],
    currentView: 'contract',
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onAddClick: () => console.log('Add sponsor'),
  },
}

export const InvoiceBoard: Story = {
  args: {
    columnKey: 'sent',
    title: 'Invoice Sent',
    sponsors: [
      mockSponsor({
        status: 'closed-won',
        contractStatus: 'contract-signed',
        invoiceStatus: 'sent',
      }),
    ],
    currentView: 'invoice',
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onAddClick: () => console.log('Add sponsor'),
  },
}

export const EmptyColumn: Story = {
  args: {
    columnKey: 'closed-won',
    title: 'Closed - Won',
    sponsors: [],
    currentView: 'pipeline',
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onAddClick: () => console.log('Add sponsor'),
  },
}

export const Loading: Story = {
  args: {
    columnKey: 'prospect',
    title: 'Prospect',
    sponsors: [],
    isLoading: true,
    currentView: 'pipeline',
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onAddClick: () => console.log('Add sponsor'),
  },
}

export const WithSelection: Story = {
  args: {
    columnKey: 'negotiating',
    title: 'Negotiating',
    sponsors: [
      mockSponsors.negotiating,
      mockSponsor({
        _id: 'sfc-6',
        sponsor: { ...mockSponsors.negotiating.sponsor, name: 'K8s Experts' },
        status: 'negotiating',
      }),
    ],
    currentView: 'pipeline',
    selectedIds: ['sfc-123'],
    isSelectionMode: true,
    onSponsorClick: (sponsor) => console.log('Sponsor clicked', sponsor),
    onSponsorDelete: (id) => console.log('Delete sponsor', id),
    onSponsorToggleSelect: (id) => console.log('Toggle select', id),
    onAddClick: () => console.log('Add sponsor'),
  },
}
