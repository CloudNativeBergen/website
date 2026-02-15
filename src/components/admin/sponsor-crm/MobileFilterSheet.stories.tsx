import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { XMarkIcon, FunnelIcon, CheckIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/MobileFilterSheet',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Bottom sheet filter panel optimized for mobile devices. Provides status, tier, and organizer filter controls with chip-based active filter display and clear-all action.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const mockStatuses = [
  { value: 'prospect', label: 'Prospect', count: 12 },
  { value: 'contacted', label: 'Contacted', count: 8 },
  { value: 'negotiating', label: 'Negotiating', count: 5 },
  { value: 'confirmed', label: 'Confirmed', count: 4 },
  { value: 'declined', label: 'Declined', count: 2 },
]

const mockTiers = [
  { value: 'platinum', label: 'Platinum' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'bronze', label: 'Bronze' },
]

const mockTags = [
  { value: 'returning', label: 'Returning Sponsor' },
  { value: 'priority', label: 'Priority' },
  { value: 'follow-up', label: 'Needs Follow-up' },
  { value: 'local', label: 'Local Company' },
]

function MobileFilterSheetDemo() {
  const [isOpen, setIsOpen] = useState(true)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([
    'prospect',
    'contacted',
  ])
  const [selectedTiers, setSelectedTiers] = useState<string[]>(['gold'])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    )
  }

  const toggleTier = (tier: string) => {
    setSelectedTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier],
    )
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const activeFilterCount =
    selectedStatuses.length + selectedTiers.length + selectedTags.length

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <FunnelIcon className="h-4 w-4" />
        Filters
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Sheet overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Sheet panel */}
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl dark:bg-gray-800">
            {/* Handle */}
            <div className="sticky top-0 bg-white pt-3 dark:bg-gray-800">
              <div className="mx-auto h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Header */}
            <div className="sticky top-4 flex items-center justify-between border-b border-gray-200 bg-white px-4 pt-2 pb-4 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Filters
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedStatuses([])
                    setSelectedTiers([])
                    setSelectedTags([])
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                >
                  Clear all
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <XMarkIcon className="h-6 w-6 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="space-y-6 p-4 pb-8">
              {/* Status filter */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status
                </h3>
                <div className="flex flex-wrap gap-2">
                  {mockStatuses.map((status) => (
                    <button
                      key={status.value}
                      onClick={() => toggleStatus(status.value)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                        selectedStatuses.includes(status.value)
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {selectedStatuses.includes(status.value) && (
                        <CheckIcon className="h-3.5 w-3.5" />
                      )}
                      {status.label}
                      <span className="text-xs opacity-60">
                        ({status.count})
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tier filter */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tier
                </h3>
                <div className="flex flex-wrap gap-2">
                  {mockTiers.map((tier) => (
                    <button
                      key={tier.value}
                      onClick={() => toggleTier(tier.value)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                        selectedTiers.includes(tier.value)
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {selectedTiers.includes(tier.value) && (
                        <CheckIcon className="h-3.5 w-3.5" />
                      )}
                      {tier.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags filter */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {mockTags.map((tag) => (
                    <button
                      key={tag.value}
                      onClick={() => toggleTag(tag.value)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                        selectedTags.includes(tag.value)
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {selectedTags.includes(tag.value) && (
                        <CheckIcon className="h-3.5 w-3.5" />
                      )}
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Apply button */}
            <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Apply Filters
                {activeFilterCount > 0 && ` (${activeFilterCount})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="flex min-h-150 w-93.75 items-start justify-center bg-gray-100 p-4 dark:bg-gray-900">
      <MobileFilterSheetDemo />
    </div>
  ),
}

export const TriggerOnly: Story = {
  render: () => (
    <div className="p-6">
      <button className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <FunnelIcon className="h-4 w-4" />
        Filters
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">
          3
        </span>
      </button>
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          MobileFilterSheet
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Bottom sheet filter UI for mobile devices. Provides touch-friendly
          filter selection for the sponsor CRM pipeline view.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              isOpen
            </code>{' '}
            - Whether the sheet is visible
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onClose
            </code>{' '}
            - Callback when sheet is closed
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              filters
            </code>{' '}
            - Current filter state (status, tier, tags)
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onFiltersChange
            </code>{' '}
            - Callback when filters change
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              availableTiers
            </code>{' '}
            - Tier options from conference
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              statusCounts
            </code>{' '}
            - Count of sponsors per status
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• Touch-friendly pill-style filter toggles</li>
          <li>• Swipe-down to close gesture (via drag handle)</li>
          <li>• Clear all filters option</li>
          <li>• Sticky apply button at bottom</li>
          <li>• Status counts shown inline</li>
          <li>• Badge on trigger shows active filter count</li>
        </ul>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200">
          Responsive Design
        </h3>
        <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
          This component is only rendered on mobile viewports. On desktop,
          filters are displayed in a sidebar or dropdown instead. Use responsive
          utilities to conditionally render.
        </p>
      </div>
    </div>
  ),
}
