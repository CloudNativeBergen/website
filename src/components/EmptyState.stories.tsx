import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { EmptyState } from './EmptyState'
import { AdminButton } from './admin/AdminButton'
import {
  UserIcon,
  ShoppingBagIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  TicketIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Components/Feedback/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A generic empty state component for displaying icon, title, description, and optional action when a list or section has no content.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    icon: UserIcon,
    title: 'No speakers found',
    description:
      'No speakers with accepted or confirmed talks were found for this conference.',
  },
}

export const WithAction: Story = {
  args: {
    icon: UserGroupIcon,
    title: 'No volunteers match your filters',
    description: 'Try adjusting your filters to see more results.',
    action: <AdminButton size="sm">Clear All Filters</AdminButton>,
  },
}

export const TitleOnly: Story = {
  args: {
    icon: ShoppingBagIcon,
    title: 'No orders found',
  },
}

export const NoIcon: Story = {
  args: {
    title: 'Nothing here yet',
    description: 'Content will appear once items are added.',
  },
}

export const WithCardStyling: Story = {
  args: {
    icon: BuildingOfficeIcon,
    title: 'No companies found',
    description: 'No company information available in ticket orders.',
    className: 'rounded-lg bg-white p-12 shadow dark:bg-gray-900',
  },
}

export const WithSubtleStyling: Story = {
  args: {
    icon: AcademicCapIcon,
    title: 'No workshops found',
    description: 'No workshops have been created for this conference yet.',
    className: 'rounded-lg bg-gray-50 p-8 dark:bg-gray-800',
  },
}

export const AllVariants: Story = {
  args: { title: '' },
  render: () => (
    <div className="max-w-2xl space-y-8">
      <div className="rounded-lg bg-gray-50 p-8 dark:bg-gray-800">
        <EmptyState
          icon={UserIcon}
          title="No speakers found"
          description="No speakers with accepted or confirmed talks were found."
        />
      </div>

      <div className="rounded-lg bg-white p-12 shadow dark:bg-gray-900">
        <EmptyState
          icon={TicketIcon}
          title="No ticket types found"
          description="No ticket types are configured for this event."
        />
      </div>

      <div className="rounded-lg bg-gray-50 p-8 dark:bg-gray-800">
        <EmptyState
          icon={UserGroupIcon}
          title="No volunteers match your filters"
          description="Try adjusting your filters to see more results."
          action={<AdminButton size="sm">Clear All Filters</AdminButton>}
        />
      </div>

      <div className="py-12">
        <EmptyState
          icon={ShoppingBagIcon}
          title="No orders found"
          description="No tickets have been sold for this event yet."
        />
      </div>
    </div>
  ),
}
