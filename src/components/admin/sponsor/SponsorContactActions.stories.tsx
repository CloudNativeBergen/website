import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  EnvelopeIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Admin/Sponsors/Contacts/SponsorContactActions',
  parameters: {
    layout: 'padded',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ActionButton({
  icon,
  label,
  disabled = false,
  variant = 'primary',
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}) {
  const baseClasses =
    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors'
  const variantClasses =
    variant === 'primary'
      ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300'
      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'

  return (
    <button className={`${baseClasses} ${variantClasses}`} disabled={disabled}>
      {icon}
      {label}
    </button>
  )
}

export const Default: Story = {
  render: () => (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Sponsor Contacts
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            15 sponsors with contact information
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ActionButton
            icon={<DocumentArrowDownIcon className="h-4 w-4" />}
            label="Export Contacts"
            variant="secondary"
          />
          <ActionButton
            icon={<EnvelopeIcon className="h-4 w-4" />}
            label="Send Broadcast (15)"
          />
        </div>
      </div>
    </div>
  ),
}

export const NoContacts: Story = {
  render: () => (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Sponsor Contacts
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No sponsors with contact information
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ActionButton
            icon={<DocumentArrowDownIcon className="h-4 w-4" />}
            label="Export Contacts"
            variant="secondary"
            disabled
          />
          <ActionButton
            icon={<EnvelopeIcon className="h-4 w-4" />}
            label="Send Broadcast (0)"
            disabled
          />
        </div>
      </div>
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorContactActions
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Action bar for sponsor contact management. Provides export and
          broadcast email functionality for all sponsors with contact
          information.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              sponsorsWithContactsCount
            </code>{' '}
            - Number of sponsors with contacts
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              fromEmail
            </code>{' '}
            - Email address for broadcast sender
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conference
            </code>{' '}
            - Conference object with event details
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Actions</h3>
        <ul className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <strong>Export Contacts</strong> - Download CSV/Excel of all sponsor
            contacts
          </li>
          <li>
            <strong>Send Broadcast</strong> - Opens modal to compose and send
            email to all sponsors
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200">
          Integration
        </h3>
        <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
          Used on the /admin/sponsors/contacts page as the header action bar.
          Integrates with GeneralBroadcastModal for email composition.
        </p>
      </div>
    </div>
  ),
}
