import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  DocumentTextIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  UsersIcon,
  CalendarDaysIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from './AdminPageHeader'

const meta = {
  title: 'Systems/Proposals/Admin/AdminPageHeader',
  component: AdminPageHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Reusable admin page header with icon, title, description, optional stat cards grid, action buttons, back link, and context highlight. Used across all admin pages for consistent layout.',
      },
    },
  },
} satisfies Meta<typeof AdminPageHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  args: {
    icon: <DocumentTextIcon className="h-full w-full" />,
    title: 'Proposals',
    description: 'Review and manage talk proposals for the conference.',
  },
}

export const WithContextHighlight: Story = {
  args: {
    icon: <CalendarDaysIcon className="h-full w-full" />,
    title: 'Schedule',
    description: 'Manage the conference schedule for',
    contextHighlight: 'Cloud Native Days Norway 2026',
  },
}

export const WithStats: Story = {
  args: {
    icon: <DocumentTextIcon className="h-full w-full" />,
    title: 'Proposals',
    description: 'Review and manage talk proposals for the conference.',
    stats: [
      { value: 142, label: 'Total', color: 'slate' },
      { value: 38, label: 'Accepted', color: 'green' },
      { value: 87, label: 'Pending', color: 'blue' },
      { value: 17, label: 'Rejected', color: 'red' },
    ],
  },
}

export const WithActionItems: Story = {
  args: {
    icon: <UsersIcon className="h-full w-full" />,
    title: 'Speakers',
    description: 'Manage speaker profiles and communications.',
    actionItems: [
      {
        label: 'Add Speaker',
        onClick: fn(),
        icon: <PlusIcon className="h-4 w-4" />,
      },
      {
        label: 'Export CSV',
        onClick: fn(),
        icon: <ArrowDownTrayIcon className="h-4 w-4" />,
        variant: 'secondary' as const,
      },
    ],
  },
}

export const WithBackLink: Story = {
  args: {
    icon: <DocumentTextIcon className="h-full w-full" />,
    title: 'Proposal Details',
    description: 'View and review this talk proposal.',
    backLink: { href: '/admin/proposals', label: 'Back to proposals' },
  },
}

export const FullFeatured: Story = {
  args: {
    icon: <TicketIcon className="h-full w-full" />,
    title: 'Tickets',
    description: 'Manage ticket sales and registrations for',
    contextHighlight: 'Cloud Native Days Norway 2026',
    backLink: { href: '/admin' },
    stats: [
      { value: 450, label: 'Sold', color: 'green' },
      { value: 100, label: 'Reserved', color: 'blue' },
      { value: 50, label: 'Remaining', color: 'yellow' },
      { value: '€45,000', label: 'Revenue', color: 'purple' },
    ],
    actionItems: [
      {
        label: 'Add Attendee',
        onClick: fn(),
        icon: <PlusIcon className="h-4 w-4" />,
      },
      {
        label: 'Export',
        onClick: fn(),
        icon: <ArrowDownTrayIcon className="h-4 w-4" />,
        variant: 'secondary' as const,
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates all features combined: back link, icon, title with context highlight, stats, and action items.',
      },
    },
  },
}

export const ManyStats: Story = {
  args: {
    icon: <DocumentTextIcon className="h-full w-full" />,
    title: 'Conference Overview',
    description: 'High-level statistics across all areas.',
    stats: [
      { value: 142, label: 'Proposals', color: 'blue' },
      { value: 38, label: 'Speakers', color: 'green' },
      { value: 12, label: 'Workshops', color: 'purple' },
      { value: 450, label: 'Tickets', color: 'indigo' },
      { value: 8, label: 'Sponsors', color: 'yellow' },
      { value: 15, label: 'Volunteers', color: 'slate' },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Six stat cards demonstrating the responsive grid layout.',
      },
    },
  },
}
