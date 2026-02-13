import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import {
  ChevronUpDownIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid'
const meta = {
  title: 'Systems/Sponsors/Admin/Form/OrganizerCombobox',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Searchable dropdown for assigning sponsors to team members. Shows avatars, names, and emails with type-ahead filtering. Supports clearing selection to unassign.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface MockOrganizer {
  _id: string
  name: string
  email?: string
  avatar?: string
}

const mockOrganizers: MockOrganizer[] = [
  {
    _id: 'org-1',
    name: 'Hans Kristian',
    email: 'hans@example.com',
    avatar: undefined,
  },
  {
    _id: 'org-2',
    name: 'Maria Jensen',
    email: 'maria@example.com',
    avatar: undefined,
  },
  {
    _id: 'org-3',
    name: 'Erik Olsen',
    email: 'erik@example.com',
    avatar: undefined,
  },
  {
    _id: 'org-4',
    name: 'Sofia Berg',
    email: 'sofia@example.com',
    avatar: undefined,
  },
]

function OrganizerAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
      {initials}
    </div>
  )
}

function OrganizerComboboxDemo() {
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const selected = mockOrganizers.find((o) => o._id === selectedId)

  const filtered =
    query === ''
      ? mockOrganizers
      : mockOrganizers.filter(
          (o) =>
            o.name.toLowerCase().includes(query.toLowerCase()) ||
            o.email?.toLowerCase().includes(query.toLowerCase()),
        )

  return (
    <div className="max-w-sm">
      <label className="block text-sm font-medium text-gray-900 dark:text-white">
        Assigned To
      </label>
      <div className="relative mt-2">
        <div
          className="relative w-full cursor-pointer rounded-md border border-gray-300 bg-white py-2 pr-10 pl-3 text-left shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
          onClick={() => setIsOpen(!isOpen)}
        >
          {selected ? (
            <div className="flex items-center gap-2">
              <OrganizerAvatar name={selected.name} />
              <span className="block truncate text-gray-900 dark:text-white">
                {selected.name}
              </span>
            </div>
          ) : (
            <input
              className="w-full border-0 bg-transparent p-0 text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white"
              placeholder="Select organizer..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
          </span>
        </div>

        {isOpen && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-gray-700">
            {/* Unassigned option */}
            <div
              className="relative cursor-pointer py-2 pr-9 pl-3 text-gray-500 hover:bg-indigo-50 dark:text-gray-400 dark:hover:bg-indigo-900/20"
              onClick={() => {
                setSelectedId('')
                setIsOpen(false)
              }}
            >
              <span className="italic">Unassigned</span>
              {selectedId === '' && (
                <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                  <CheckIcon className="h-5 w-5 text-indigo-600" />
                </span>
              )}
            </div>

            {filtered.map((organizer) => (
              <div
                key={organizer._id}
                className="relative cursor-pointer py-2 pr-9 pl-3 text-gray-900 hover:bg-indigo-50 dark:text-white dark:hover:bg-indigo-900/20"
                onClick={() => {
                  setSelectedId(organizer._id)
                  setIsOpen(false)
                  setQuery('')
                }}
              >
                <div className="flex items-center gap-2">
                  <OrganizerAvatar name={organizer.name} />
                  <div>
                    <p className="font-medium">{organizer.name}</p>
                    {organizer.email && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {organizer.email}
                      </p>
                    )}
                  </div>
                </div>
                {selectedId === organizer._id && (
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                    <CheckIcon className="h-5 w-5 text-indigo-600" />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <button
          className="mt-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
          onClick={() => setSelectedId('')}
        >
          <XMarkIcon className="h-4 w-4" />
          Clear selection
        </button>
      )}
    </div>
  )
}

export const Default: Story = {
  render: () => <OrganizerComboboxDemo />,
}

export const WithSelection: Story = {
  render: () => {
    const selected = mockOrganizers[0]
    return (
      <div className="max-w-sm">
        <label className="block text-sm font-medium text-gray-900 dark:text-white">
          Assigned To
        </label>
        <div className="relative mt-2">
          <div className="relative w-full cursor-pointer rounded-md border border-gray-300 bg-white py-2 pr-10 pl-3 text-left shadow-sm dark:border-gray-600 dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <OrganizerAvatar name={selected.name} />
              <span className="block truncate text-gray-900 dark:text-white">
                {selected.name}
              </span>
            </div>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
            </span>
          </div>
        </div>
        <button className="mt-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
          <XMarkIcon className="h-4 w-4" />
          Clear selection
        </button>
      </div>
    )
  },
}
