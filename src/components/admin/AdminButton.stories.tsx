import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { AdminButton } from './AdminButton'
import { TrashIcon, PlusIcon, PencilIcon } from '@heroicons/react/24/outline'

const meta = {
  title: 'Components/Layout/AdminButton',
  component: AdminButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Shared button for admin interfaces. Supports primary (colored), secondary (outlined), and ghost variants with six color options and three sizes.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClick: fn(),
    children: 'Button',
  },
} satisfies Meta<typeof AdminButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { children: 'Save Changes' },
}

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Cancel' },
}

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Reset' },
}

export const AllColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <AdminButton color="indigo">Indigo</AdminButton>
      <AdminButton color="blue">Blue</AdminButton>
      <AdminButton color="green">Green</AdminButton>
      <AdminButton color="red">Red</AdminButton>
      <AdminButton color="purple">Purple</AdminButton>
      <AdminButton color="yellow">Yellow</AdminButton>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <AdminButton size="xs">Extra Small</AdminButton>
      <AdminButton size="sm">Small</AdminButton>
      <AdminButton size="md">Medium</AdminButton>
    </div>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <AdminButton variant="primary">Primary</AdminButton>
      <AdminButton variant="secondary">Secondary</AdminButton>
      <AdminButton variant="ghost">Ghost</AdminButton>
    </div>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <AdminButton color="green">
        <PlusIcon className="h-4 w-4" />
        Add Item
      </AdminButton>
      <AdminButton color="blue">
        <PencilIcon className="h-4 w-4" />
        Edit
      </AdminButton>
      <AdminButton color="red">
        <TrashIcon className="h-4 w-4" />
        Delete
      </AdminButton>
    </div>
  ),
}

export const Disabled: Story = {
  args: { disabled: true, children: 'Disabled' },
}

export const DisabledVariants: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <AdminButton disabled>Primary</AdminButton>
      <AdminButton variant="secondary" disabled>
        Secondary
      </AdminButton>
      <AdminButton variant="ghost" disabled>
        Ghost
      </AdminButton>
    </div>
  ),
}

export const ActionBarExample: Story = {
  render: () => (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <AdminButton size="xs" color="indigo">
        Edit
      </AdminButton>
      <AdminButton size="xs" color="purple">
        Preview
      </AdminButton>
      <AdminButton size="xs" color="blue">
        Email
      </AdminButton>
      <AdminButton size="xs" color="green">
        Approve
      </AdminButton>
      <AdminButton size="xs" color="yellow">
        Remind
      </AdminButton>
      <AdminButton size="xs" color="red">
        Reject
      </AdminButton>
    </div>
  ),
}

export const ModalFooterExample: Story = {
  render: () => (
    <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
      <AdminButton variant="secondary" size="md">
        Cancel
      </AdminButton>
      <AdminButton color="blue" size="md">
        Save Changes
      </AdminButton>
    </div>
  ),
}
