import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { SponsorContactRoleSelect } from './SponsorContactRoleSelect'
import { CONTACT_ROLE_OPTIONS } from '@/lib/sponsor/types'

const meta = {
  title: 'Systems/Sponsors/Admin/SponsorContactRoleSelect',
  component: SponsorContactRoleSelect,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Simple dropdown for selecting contact person roles. Used in sponsor contact forms to categorize contact persons by their function. Accepts an optional className to override default styling.',
      },
    },
  },
} satisfies Meta<typeof SponsorContactRoleSelect>

export default meta
type Story = StoryObj<typeof meta>

function InteractiveDemo({ className }: { className?: string }) {
  const [value, setValue] = useState('')
  return (
    <div className="w-64">
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Contact Role
      </label>
      <SponsorContactRoleSelect
        value={value}
        onChange={setValue}
        className={className}
      />
      {value && (
        <p className="mt-2 text-xs text-gray-500">
          Selected: <strong>{value}</strong>
        </p>
      )}
    </div>
  )
}

export const Default: Story = {
  args: { value: '', onChange: () => {} },
  render: () => <InteractiveDemo />,
}

export const WithSelection: Story = {
  args: {
    value: 'Marketing',
    onChange: () => {},
  },
}

export const Disabled: Story = {
  args: {
    value: 'Technical Contact',
    onChange: () => {},
    disabled: true,
  },
}

export const CustomPlaceholder: Story = {
  args: {
    value: '',
    onChange: () => {},
    placeholder: 'Choose a role...',
  },
}

export const WithCustomClassName: Story = {
  args: { value: '', onChange: () => {} },
  render: () => (
    <InteractiveDemo className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
  ),
}

export const AllRoles: Story = {
  args: { value: '', onChange: () => {} },
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Available Roles
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {CONTACT_ROLE_OPTIONS.map((role) => (
          <div
            key={role}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {role}
          </div>
        ))}
      </div>
    </div>
  ),
}
