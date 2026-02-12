import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { ChevronUpDownIcon, CheckIcon, PlusIcon } from '@heroicons/react/20/solid'

const meta = {
  title: 'Admin/Sponsors/Form/SponsorCombobox',
  parameters: {
    layout: 'padded',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface Sponsor {
  _id: string
  name: string
}

const mockSponsors: Sponsor[] = [
  { _id: 'sp-1', name: 'Acme Corporation' },
  { _id: 'sp-2', name: 'TechStart Inc' },
  { _id: 'sp-3', name: 'CloudCo' },
  { _id: 'sp-4', name: 'DataSystems' },
  { _id: 'sp-5', name: 'Nordic Software' },
  { _id: 'sp-6', name: 'DevOps Labs' },
]

function SponsorComboboxDemo() {
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  const selected = mockSponsors.find((s) => s._id === selectedId)

  const filtered =
    query === ''
      ? mockSponsors
      : mockSponsors.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()),
      )

  const showCreateOption = query.length > 0 && filtered.length === 0

  return (
    <div className="max-w-sm">
      <label className="block text-sm font-medium text-gray-900 dark:text-white">
        Select Sponsor
      </label>
      <div className="relative mt-2">
        <div
          className="relative w-full cursor-pointer rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
          onClick={() => setIsOpen(!isOpen)}
        >
          {selected && !isOpen ? (
            <span className="block truncate text-gray-900 dark:text-white">
              {selected.name}
            </span>
          ) : (
            <input
              className="w-full border-0 bg-transparent p-0 text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white"
              placeholder="Search sponsors..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setIsOpen(true)
              }}
              onFocus={() => setIsOpen(true)}
            />
          )}
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
          </span>
        </div>

        {isOpen && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-gray-700">
            {/* Create new option */}
            {showCreateOption && (
              <div
                className="relative cursor-pointer bg-indigo-50 py-2 pl-3 pr-9 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400"
                onClick={() => {
                  setIsCreatingNew(true)
                  setIsOpen(false)
                }}
              >
                <div className="flex items-center gap-2">
                  <PlusIcon className="h-5 w-5" />
                  <span>
                    Create &ldquo;{query}&rdquo;
                  </span>
                </div>
              </div>
            )}

            {filtered.map((sponsor) => (
              <div
                key={sponsor._id}
                className="relative cursor-pointer py-2 pl-3 pr-9 text-gray-900 hover:bg-indigo-50 dark:text-white dark:hover:bg-indigo-900/20"
                onClick={() => {
                  setSelectedId(sponsor._id)
                  setIsOpen(false)
                  setQuery('')
                }}
              >
                <span className="block truncate">{sponsor.name}</span>
                {selectedId === sponsor._id && (
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                    <CheckIcon className="h-5 w-5 text-indigo-600" />
                  </span>
                )}
              </div>
            ))}

            {filtered.length === 0 && !showCreateOption && (
              <div className="py-2 pl-3 pr-9 text-gray-500">
                No sponsors found
              </div>
            )}
          </div>
        )}
      </div>

      {/* New sponsor form */}
      {isCreatingNew && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
          <h4 className="font-medium text-gray-900 dark:text-white">
            Create New Sponsor
          </h4>
          <div className="mt-3 space-y-3">
            <input
              type="text"
              placeholder="Company name"
              defaultValue={query}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
            <input
              type="url"
              placeholder="Website URL"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
            <div className="flex gap-2">
              <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                Create
              </button>
              <button
                className="rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
                onClick={() => {
                  setIsCreatingNew(false)
                  setQuery('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const Default: Story = {
  render: () => <SponsorComboboxDemo />,
}

export const WithSelection: Story = {
  render: () => {
    const selected = mockSponsors[2]
    return (
      <div className="max-w-sm">
        <label className="block text-sm font-medium text-gray-900 dark:text-white">
          Select Sponsor
        </label>
        <div className="relative mt-2">
          <div className="relative w-full cursor-pointer rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm dark:border-gray-600 dark:bg-gray-800">
            <span className="block truncate text-gray-900 dark:text-white">
              {selected.name}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
            </span>
          </div>
        </div>
      </div>
    )
  },
}

export const Documentation: Story = {
  render: () => (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorCombobox
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Searchable sponsor selector with inline creation capability. When no
          matching sponsor is found, offers to create a new one with the search
          query as the initial name.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              value
            </code>{' '}
            - Selected sponsor ID
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onChange
            </code>{' '}
            - Callback when selection changes
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              availableSponsors
            </code>{' '}
            - Array of Sponsor objects
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              disabled?
            </code>{' '}
            - Disable the combobox
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onSponsorCreated?
            </code>{' '}
            - Callback after new sponsor creation
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Features</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• Type-ahead search filtering</li>
          <li>• Create new sponsor inline when not found</li>
          <li>• Uses tRPC mutation for sponsor creation</li>
          <li>• Auto-invalidates sponsor list cache on creation</li>
        </ul>
      </div>
    </div>
  ),
}
