import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalStatusBadge } from './badges'
import { Status, statuses } from '../types'

const meta: Meta<typeof ProposalStatusBadge> = {
  title: 'Systems/Proposals/ProposalStatusBadge',
  component: ProposalStatusBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Domain adapter that maps a proposal `Status` to the shared `StatusBadge`, giving every proposal surface the same label and colour ladder without re-deriving it.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof ProposalStatusBadge>

export const Draft: Story = { args: { status: Status.draft } }
export const Submitted: Story = { args: { status: Status.submitted } }
export const Accepted: Story = { args: { status: Status.accepted } }
export const Waitlisted: Story = { args: { status: Status.waitlisted } }
export const Confirmed: Story = { args: { status: Status.confirmed } }
export const Rejected: Story = { args: { status: Status.rejected } }
export const Withdrawn: Story = { args: { status: Status.withdrawn } }
export const Deleted: Story = { args: { status: Status.deleted } }

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {Array.from(statuses.keys()).map((status) => (
        <ProposalStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
}
