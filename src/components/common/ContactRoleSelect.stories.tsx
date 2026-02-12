import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { CONTACT_ROLE_OPTIONS } from '@/lib/sponsor/types'

const meta = {
  title: 'Admin/Sponsors/Utility/ContactRoleSelect',
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ContactRoleSelectDemo() {
  const [value, setValue] = useState('')

  return (
    <div className="w-48">
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Contact Role
      </label>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        <option value="">Select role...</option>
        {CONTACT_ROLE_OPTIONS.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </div>
  )
}

export const Default: Story = {
  render: () => <ContactRoleSelectDemo />,
}

export const WithSelection: Story = {
  render: () => (
    <div className="w-48">
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Contact Role
      </label>
      <select
        value="Marketing"
        onChange={() => { }}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        <option value="">Select role...</option>
        {CONTACT_ROLE_OPTIONS.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </div>
  ),
}

export const AllRoles: Story = {
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

export const Documentation: Story = {
  render: () => (
    <div className="max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          ContactRoleSelect
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Simple dropdown for selecting contact person roles. Used in sponsor
          contact forms to categorize contact persons by their function.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              value
            </code>{' '}
            - Currently selected role
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onChange
            </code>{' '}
            - Callback when role changes
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              placeholder
            </code>{' '}
            - Custom placeholder text
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              disabled
            </code>{' '}
            - Disable the select
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Available Roles
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          {CONTACT_ROLE_OPTIONS.map((role) => (
            <li key={role}>• {role}</li>
          ))}
        </ul>
      </div>
    </div>
  ),
}
