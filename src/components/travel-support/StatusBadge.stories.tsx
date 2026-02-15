import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { StatusBadge } from './StatusBadge'
import { TravelSupportStatus } from '@/lib/travel-support/types'

const meta = {
  title: 'Systems/Speakers/TravelSupport/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Travel-support-specific status badge that maps `TravelSupportStatus` enum values to display names and colors via `TravelSupportService`, then renders the shared `StatusBadge` component.',
      },
    },
  },
} satisfies Meta<typeof StatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Draft: Story = {
  args: { status: TravelSupportStatus.DRAFT },
}

export const Submitted: Story = {
  args: { status: TravelSupportStatus.SUBMITTED },
}

export const Approved: Story = {
  args: { status: TravelSupportStatus.APPROVED },
}

export const Paid: Story = {
  args: { status: TravelSupportStatus.PAID },
}

export const Rejected: Story = {
  args: { status: TravelSupportStatus.REJECTED },
}

export const AllStatuses: Story = {
  args: { status: TravelSupportStatus.DRAFT },
  render: () => (
    <div className="flex flex-wrap gap-3">
      {Object.values(TravelSupportStatus).map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All travel support statuses displayed side by side.',
      },
    },
  },
}
