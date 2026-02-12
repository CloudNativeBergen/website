import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ActionMenu, ActionMenuItem, ActionMenuDivider } from './ActionMenu'
import {
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import { fn } from 'storybook/test'

const meta: Meta<typeof ActionMenu> = {
  title: 'Components/Data Display/ActionMenu',
  component: ActionMenu,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A dropdown action menu triggered by a vertical ellipsis button. Supports items with icons, danger variants, dividers, and automatic drop-up when near the bottom of the viewport.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-50 items-start justify-center p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ActionMenu>

export const Default: Story = {
  render: () => (
    <ActionMenu>
      <ActionMenuItem onClick={fn()} icon={EyeIcon}>
        View
      </ActionMenuItem>
      <ActionMenuItem onClick={fn()} icon={PencilIcon}>
        Edit
      </ActionMenuItem>
      <ActionMenuItem onClick={fn()} icon={DocumentDuplicateIcon}>
        Duplicate
      </ActionMenuItem>
      <ActionMenuDivider />
      <ActionMenuItem onClick={fn()} icon={TrashIcon} variant="danger">
        Delete
      </ActionMenuItem>
    </ActionMenu>
  ),
}

export const LeftAligned: Story = {
  render: () => (
    <ActionMenu position="left">
      <ActionMenuItem onClick={fn()} icon={EyeIcon}>
        View Details
      </ActionMenuItem>
      <ActionMenuItem onClick={fn()} icon={ArrowDownTrayIcon}>
        Download
      </ActionMenuItem>
    </ActionMenu>
  ),
}

export const WithDisabledItem: Story = {
  render: () => (
    <ActionMenu>
      <ActionMenuItem onClick={fn()} icon={PencilIcon}>
        Edit
      </ActionMenuItem>
      <ActionMenuItem onClick={fn()} icon={DocumentDuplicateIcon} disabled>
        Duplicate (unavailable)
      </ActionMenuItem>
      <ActionMenuDivider />
      <ActionMenuItem onClick={fn()} icon={TrashIcon} variant="danger">
        Delete
      </ActionMenuItem>
    </ActionMenu>
  ),
}

export const MinimalMenu: Story = {
  render: () => (
    <ActionMenu ariaLabel="Proposal actions">
      <ActionMenuItem onClick={fn()} icon={PencilIcon}>
        Edit Proposal
      </ActionMenuItem>
      <ActionMenuItem onClick={fn()} icon={TrashIcon} variant="danger">
        Delete Proposal
      </ActionMenuItem>
    </ActionMenu>
  ),
}
