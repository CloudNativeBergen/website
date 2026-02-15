import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { StatusBadge } from './StatusBadge'
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/Data Display/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A generic status pill badge used across the application. Accepts a colour, label, and optional icon. Domain-specific status-to-colour mappings remain in their respective modules.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof StatusBadge>

export const Green: Story = {
  args: { label: 'Confirmed', color: 'green', icon: CheckCircleIcon },
}

export const Yellow: Story = {
  args: { label: 'Pending', color: 'yellow', icon: ClockIcon },
}

export const Red: Story = {
  args: { label: 'Rejected', color: 'red', icon: XCircleIcon },
}

export const Blue: Story = {
  args: { label: 'Submitted', color: 'blue' },
}

export const Orange: Story = {
  args: {
    label: 'Withdrawn',
    color: 'orange',
    icon: ExclamationTriangleIcon,
  },
}

export const Gray: Story = {
  args: { label: 'Draft', color: 'gray' },
}

export const Purple: Story = {
  args: { label: 'In Review', color: 'purple' },
}

export const AllColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge label="Confirmed" color="green" icon={CheckCircleIcon} />
      <StatusBadge label="Pending" color="yellow" icon={ClockIcon} />
      <StatusBadge label="Rejected" color="red" icon={XCircleIcon} />
      <StatusBadge label="Submitted" color="blue" />
      <StatusBadge label="Withdrawn" color="orange" />
      <StatusBadge label="Draft" color="gray" />
      <StatusBadge label="In Review" color="purple" />
    </div>
  ),
}
