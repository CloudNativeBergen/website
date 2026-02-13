import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  PlusIcon,
  ArrowDownTrayIcon,
  PaperAirplaneIcon,
  Cog6ToothIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { AdminHeaderActions } from './AdminHeaderActions'

const meta = {
  title: 'Systems/Proposals/Admin/AdminHeaderActions',
  component: AdminHeaderActions,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Responsive action button bar for admin page headers. On desktop (lg+), all buttons are shown inline. On mobile, they collapse into a ⋮ dropdown menu. Supports primary/secondary variants, icons, links, disabled state, and custom render functions.',
      },
    },
  },
} satisfies Meta<typeof AdminHeaderActions>

export default meta
type Story = StoryObj<typeof meta>

const onClick = fn()

export const PrimaryButtons: Story = {
  args: {
    items: [
      { label: 'Create New', onClick, icon: <PlusIcon className="h-4 w-4" /> },
      {
        label: 'Export',
        onClick,
        icon: <ArrowDownTrayIcon className="h-4 w-4" />,
      },
    ],
  },
}

export const MixedVariants: Story = {
  args: {
    items: [
      {
        label: 'Send Notification',
        onClick,
        icon: <PaperAirplaneIcon className="h-4 w-4" />,
        variant: 'primary',
      },
      {
        label: 'Settings',
        onClick,
        icon: <Cog6ToothIcon className="h-4 w-4" />,
        variant: 'secondary',
      },
    ],
  },
}

export const WithLinks: Story = {
  args: {
    items: [
      {
        label: 'View Site',
        href: 'https://example.com',
        target: '_blank',
        icon: <ArrowTopRightOnSquareIcon className="h-4 w-4" />,
      },
      { label: 'Dashboard', href: '/admin' },
    ],
  },
}

export const WithDisabled: Story = {
  args: {
    items: [
      { label: 'Create New', onClick, icon: <PlusIcon className="h-4 w-4" /> },
      {
        label: 'Publish All',
        onClick,
        disabled: true,
        icon: <PaperAirplaneIcon className="h-4 w-4" />,
      },
      {
        label: 'Export',
        onClick,
        icon: <ArrowDownTrayIcon className="h-4 w-4" />,
        variant: 'secondary',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'The middle button is disabled and cannot be clicked.',
      },
    },
  },
}

export const SingleAction: Story = {
  args: {
    items: [
      {
        label: 'Add Speaker',
        onClick,
        icon: <PlusIcon className="h-4 w-4" />,
      },
    ],
  },
}

export const ManyActions: Story = {
  args: {
    items: [
      { label: 'Create', onClick, icon: <PlusIcon className="h-4 w-4" /> },
      {
        label: 'Export',
        onClick,
        icon: <ArrowDownTrayIcon className="h-4 w-4" />,
        variant: 'secondary',
      },
      {
        label: 'Send',
        onClick,
        icon: <PaperAirplaneIcon className="h-4 w-4" />,
      },
      {
        label: 'Settings',
        onClick,
        icon: <Cog6ToothIcon className="h-4 w-4" />,
        variant: 'secondary',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Multiple actions showing how the bar scales. On mobile, these collapse into a dropdown.',
      },
    },
  },
}
