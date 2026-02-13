import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorAddModal } from './SponsorAddModal'
import { XMarkIcon, PhotoIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

const meta = {
  title: 'Systems/Sponsors/Admin/Tiers/SponsorAddModal',
  component: SponsorAddModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Modal dialog for adding a sponsor to a conference. Supports two modes: selecting an existing sponsor from the database or creating a new sponsor inline with logo upload. Tier selection with pricing display and form validation.',
      },
    },
  },
} as Meta

export default meta
type Story = StoryObj<typeof meta>

const mockTiers = [
  { _id: 'tier-1', title: 'Platinum', value: 100000 },
  { _id: 'tier-2', title: 'Gold', value: 50000 },
  { _id: 'tier-3', title: 'Silver', value: 25000 },
  { _id: 'tier-4', title: 'Bronze', value: 10000 },
]

const mockExistingSponsors = [
  { _id: 'sponsor-1', name: 'TechGiant Corp' },
  { _id: 'sponsor-2', name: 'CloudPro Inc' },
  { _id: 'sponsor-3', name: 'DataSys' },
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 0,
  }).format(value)
}

function AddSponsorModal({ preselectedTier }: { preselectedTier?: string }) {
  const [mode, setMode] = useState<'select' | 'create'>('select')
  const [selectedTier, setSelectedTier] = useState(preselectedTier || '')
  const [selectedSponsor, setSelectedSponsor] = useState('')
  const [newSponsorName, setNewSponsorName] = useState('')
  const [newSponsorWebsite, setNewSponsorWebsite] = useState('')

  return (
    <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Add Sponsor to Conference
        </h2>
        <button className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700">
          <XMarkIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="space-y-6 p-6">
        {/* Mode toggle */}
        <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
          <button
            onClick={() => setMode('select')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'select'
                ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Select Existing
          </button>
          <button
            onClick={() => setMode('create')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Create New
          </button>
        </div>

        {/* Tier selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Sponsor Tier
          </label>
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">Select a tier...</option>
            {mockTiers.map((tier) => (
              <option key={tier._id} value={tier._id}>
                {tier.title} ({formatCurrency(tier.value)})
              </option>
            ))}
          </select>
        </div>

        {mode === 'select' ? (
          /* Select existing sponsor */
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Sponsor
            </label>
            <select
              value={selectedSponsor}
              onChange={(e) => setSelectedSponsor(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select a sponsor...</option>
              {mockExistingSponsors.map((sponsor) => (
                <option key={sponsor._id} value={sponsor._id}>
                  {sponsor.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Sponsors already added to this conference are not shown
            </p>
          </div>
        ) : (
          /* Create new sponsor form */
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Sponsor Name
              </label>
              <input
                type="text"
                value={newSponsorName}
                onChange={(e) => setNewSponsorName(e.target.value)}
                placeholder="e.g. Acme Corporation"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Website
              </label>
              <input
                type="url"
                value={newSponsorWebsite}
                onChange={(e) => setNewSponsorWebsite(e.target.value)}
                placeholder="https://example.com"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Logo
              </label>
              <div className="mt-1 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 dark:border-gray-600">
                <div className="text-center">
                  <PhotoIcon className="mx-auto h-10 w-10 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Drop logo here or click to upload
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    SVG or PNG recommended
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
          Cancel
        </button>
        <button
          disabled={
            !selectedTier ||
            (mode === 'select' ? !selectedSponsor : !newSponsorName)
          }
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex items-center gap-1.5">
            <PlusIcon className="h-4 w-4" />
            {mode === 'select' ? 'Add Sponsor' : 'Create & Add'}
          </span>
        </button>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="p-6">
      <AddSponsorModal />
    </div>
  ),
}

export const WithPreselectedTier: Story = {
  render: () => (
    <div className="p-6">
      <AddSponsorModal preselectedTier="tier-2" />
    </div>
  ),
}
