import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  XMarkIcon,
  ClockIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Sponsor Detail/SponsorCRMForm',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Edit modal for sponsor pipeline entries. Provides fields for status, tier, contract value, organizer assignment, tags, and notes. Supports both editing existing sponsors and creating new entries.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const PIPELINE_STATUSES = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
]

const TIERS = [
  { id: 'platinum', name: 'Platinum', value: 100000 },
  { id: 'gold', name: 'Gold', value: 50000 },
  { id: 'silver', name: 'Silver', value: 25000 },
  { id: 'bronze', name: 'Bronze', value: 10000 },
  { id: 'community', name: 'Community', value: 0 },
]

function CRMFormPreview() {
  return (
    <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            TechGiant Corp
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Edit sponsor pipeline entry
          </p>
        </div>
        <button className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700">
          <XMarkIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-6 px-6">
          <button className="border-b-2 border-indigo-500 py-3 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Pipeline
          </button>
          <button className="border-b-2 border-transparent py-3 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" />
              History
            </span>
          </button>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Sponsor Selection */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Sponsor
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              TG
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                TechGiant Corp
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                techgiant.com
              </p>
            </div>
          </div>
        </div>

        {/* Status & Tier Row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Pipeline Status
            </label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
              {PIPELINE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Assigned To
            </label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
              <option value="">Unassigned</option>
              <option value="hans">Hans Kristian</option>
              <option value="maria">Maria Jensen</option>
              <option value="erik">Erik Olsen</option>
            </select>
          </div>
        </div>

        {/* Tier Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Sponsor Tier
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIERS.slice(0, 3).map((tier) => (
              <label
                key={tier.id}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${tier.id === 'gold'
                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tier"
                    checked={tier.id === 'gold'}
                    readOnly
                    className="text-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {tier.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tier.value > 0
                        ? new Intl.NumberFormat('nb-NO', {
                          style: 'currency',
                          currency: 'NOK',
                          maximumFractionDigits: 0,
                        }).format(tier.value)
                        : 'Free'}
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Contract Value */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Contract Value
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={50000}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <select className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
              <option>NOK</option>
              <option>EUR</option>
              <option>USD</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tags
          </label>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-sm text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              returning
              <button className="hover:text-indigo-900">×</button>
            </span>
            <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-sm text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              priority
              <button className="hover:text-indigo-900">×</button>
            </span>
            <button className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-sm text-gray-500 hover:border-gray-400 dark:border-gray-600">
              + Add tag
            </button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Notes
          </label>
          <textarea
            rows={3}
            placeholder="Internal notes about this sponsor..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Info Box */}
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
          <InformationCircleIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Contract status and invoice status are managed separately on their
            respective tabs.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button className="text-sm text-red-600 hover:text-red-700 dark:text-red-400">
          Delete Entry
        </button>
        <div className="flex gap-3">
          <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="p-6">
      <CRMFormPreview />
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorCRMForm
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Main edit modal for sponsor pipeline entries. Includes all CRM fields
          organized into tabs: Pipeline details, History timeline.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              isOpen
            </code>{' '}
            - Whether modal is visible
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onClose
            </code>{' '}
            - Callback when closed
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              sponsor
            </code>{' '}
            - SponsorForConference to edit (null for new)
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conference
            </code>{' '}
            - Conference with tier definitions
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              initialView
            </code>{' '}
            - Tab to open (pipeline/history)
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Form Sections
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• Sponsor selection (existing or create new)</li>
          <li>• Pipeline status and assignee</li>
          <li>• Tier selection with radio group</li>
          <li>• Contract value with currency</li>
          <li>• Add-ons checkbox group</li>
          <li>• Tags combobox</li>
          <li>• Notes textarea</li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Tabs</h3>
        <ul className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <strong>Pipeline</strong> - Main form fields for sponsor details
          </li>
          <li>
            <strong>History</strong> - Activity timeline with all events
          </li>
        </ul>
      </div>
    </div>
  ),
}
