import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorTierEditor } from './SponsorTierEditor'
import { useState } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  StarIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Tiers/SponsorTierEditor',
  component: SponsorTierEditor,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Modal form for creating and editing sponsor tier definitions. Includes title, tagline, tier type, pricing with multi-currency support, capacity limits, sold out and most popular flags, and perks with bulk paste support.',
      },
    },
  },
} as Meta

export default meta
type Story = StoryObj<typeof meta>

interface TierPerk {
  label: string
  description: string
}

const mockPerks: TierPerk[] = [
  { label: 'Keynote slot', description: '30-minute keynote presentation' },
  { label: 'Premium booth', description: 'Large corner booth location' },
  { label: 'Logo placement', description: 'Logo on all marketing materials' },
  { label: 'Attendee list', description: 'Access to attendee contact list' },
]

function TierEditorModal() {
  const [formData, setFormData] = useState({
    title: 'Platinum',
    tagline: 'Premium sponsorship with maximum visibility',
    tierType: 'standard' as 'standard' | 'community' | 'media',
    price: 100000,
    currency: 'NOK',
    maxQuantity: 3,
    soldOut: false,
    mostPopular: true,
    perks: mockPerks,
  })

  return (
    <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Edit Sponsor Tier
        </h2>
        <button className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700">
          <XMarkIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="space-y-6 p-6">
        {/* Basic Info */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tier Name
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tier Type
            </label>
            <select
              value={formData.tierType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tierType: e.target.value as
                    | 'standard'
                    | 'community'
                    | 'media',
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="standard">Standard</option>
              <option value="community">Community</option>
              <option value="media">Media Partner</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tagline
          </label>
          <input
            type="text"
            value={formData.tagline}
            onChange={(e) =>
              setFormData({ ...formData, tagline: e.target.value })
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Short description for the tier"
          />
        </div>

        {/* Pricing */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Price
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: Number(e.target.value) })
                }
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="NOK">NOK</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Max Quantity
            </label>
            <input
              type="number"
              value={formData.maxQuantity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxQuantity: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Unlimited"
            />
          </div>
        </div>

        {/* Flags */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.mostPopular}
              onChange={(e) =>
                setFormData({ ...formData, mostPopular: e.target.checked })
              }
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
              <StarIcon className="h-4 w-4 text-amber-500" />
              Most Popular
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.soldOut}
              onChange={(e) =>
                setFormData({ ...formData, soldOut: e.target.checked })
              }
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Sold Out
            </span>
          </label>
        </div>

        {/* Perks */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Perks
            </label>
            <button className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
              <PlusIcon className="h-4 w-4" />
              Add Perk
            </button>
          </div>
          <div className="space-y-2">
            {formData.perks.map((perk, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <div className="flex-1">
                  <input
                    type="text"
                    value={perk.label}
                    className="w-full border-0 bg-transparent p-0 text-sm font-medium text-gray-900 focus:ring-0 dark:text-white"
                    placeholder="Perk name"
                  />
                  <input
                    type="text"
                    value={perk.description}
                    className="w-full border-0 bg-transparent p-0 text-xs text-gray-500 focus:ring-0 dark:text-gray-400"
                    placeholder="Optional description"
                  />
                </div>
                <button className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400">
          <TrashIcon className="h-4 w-4" />
          Delete Tier
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
      <TierEditorModal />
    </div>
  ),
}

export const TierCards: Story = {
  render: () => {
    const tiers = [
      {
        title: 'Platinum',
        price: 100000,
        mostPopular: true,
        soldOut: false,
        count: 2,
        max: 3,
      },
      {
        title: 'Gold',
        price: 50000,
        mostPopular: false,
        soldOut: false,
        count: 4,
        max: 6,
      },
      {
        title: 'Silver',
        price: 25000,
        mostPopular: false,
        soldOut: true,
        count: 8,
        max: 8,
      },
      {
        title: 'Community',
        price: 0,
        mostPopular: false,
        soldOut: false,
        count: 3,
        max: undefined,
      },
    ]

    return (
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Tier Management
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {tiers.map((tier) => (
            <div
              key={tier.title}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {tier.title}
                  </h3>
                  {tier.mostPopular && (
                    <StarIcon className="h-4 w-4 text-amber-500" />
                  )}
                  {tier.soldOut && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Sold Out
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {tier.price > 0
                    ? new Intl.NumberFormat('nb-NO', {
                        style: 'currency',
                        currency: 'NOK',
                        maximumFractionDigits: 0,
                      }).format(tier.price)
                    : 'Free'}
                  {tier.max && (
                    <span className="ml-2">
                      • {tier.count}/{tier.max} sold
                    </span>
                  )}
                </p>
              </div>
              <button className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
                <PencilIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
          ))}
          <button className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:hover:border-indigo-500">
            <PlusIcon className="h-5 w-5" />
            Add New Tier
          </button>
        </div>
      </div>
    )
  },
}
