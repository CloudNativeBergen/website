import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { AdminFilterBar, type FilterGroup } from './AdminFilterBar'

const meta = {
  title: 'Systems/Admin/AdminFilterBar',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Shared responsive filter bar for the admin area. On desktop it renders an inline row of dropdowns, optional search and a result count. Below `lg` the dropdowns collapse into a single "Filters (n)" button that opens a full-height bottom sheet.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

const FORMAT_OPTIONS = [
  { value: 'talk', label: 'Talk (25 min)' },
  { value: 'workshop', label: 'Workshop (90 min)' },
  { value: 'lightning', label: 'Lightning talk (10 min)' },
]

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

const OWNER_OPTIONS = [
  { value: '', label: 'All owners' },
  { value: 'alice', label: 'Alice Johnson' },
  { value: 'bob', label: 'Bob Smith' },
  { value: 'carol', label: 'Carol Williams' },
]

/**
 * Interactive harness that wires the declarative config to local state so the
 * dropdowns, chips and search all behave in Storybook.
 */
function AdminFilterBarDemo({
  withSearch = true,
  withCount = true,
  many = false,
}: {
  withSearch?: boolean
  withCount?: boolean
  many?: boolean
}) {
  const [status, setStatus] = useState<string[]>(['submitted'])
  const [format, setFormat] = useState<string[]>([])
  const [level, setLevel] = useState<string[]>([])
  const [owner, setOwner] = useState<string>('')
  const [search, setSearch] = useState('')

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) =>
    setter((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    )

  const filters: FilterGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: STATUS_OPTIONS,
      selected: status,
      onChange: (value) => toggle(setStatus, value),
    },
    {
      key: 'format',
      label: 'Format',
      options: FORMAT_OPTIONS,
      selected: format,
      onChange: (value) => toggle(setFormat, value),
    },
    {
      key: 'level',
      label: 'Level',
      options: LEVEL_OPTIONS,
      selected: level,
      onChange: (value) => toggle(setLevel, value),
    },
  ]

  if (many) {
    filters.push(
      {
        key: 'owner',
        label: 'Owner',
        options: OWNER_OPTIONS,
        selected: [owner],
        onChange: setOwner,
        multi: false,
      },
      {
        key: 'tags',
        label: 'Tags',
        options: [
          { value: 'keynote', label: 'Keynote' },
          { value: 'sponsored', label: 'Sponsored' },
          { value: 'community', label: 'Community' },
          { value: 'diversity', label: 'Diversity & inclusion' },
          { value: 'security', label: 'Security' },
          { value: 'observability', label: 'Observability' },
        ],
        selected: [],
        onChange: () => {},
      },
    )
  }

  const activeCount =
    status.filter(Boolean).length +
    format.length +
    level.length +
    (owner ? 1 : 0)

  return (
    <AdminFilterBar
      filters={filters}
      search={
        withSearch
          ? {
              value: search,
              onChange: setSearch,
              placeholder: 'Search proposals or speakers...',
            }
          : undefined
      }
      resultCount={withCount ? 42 : undefined}
      totalCount={withCount ? 128 : undefined}
      resultLabel="proposals"
      activeFilterCount={activeCount}
      onClearAll={() => {
        setStatus([])
        setFormat([])
        setLevel([])
        setOwner('')
        setSearch('')
      }}
    />
  )
}

export const Desktop: Story = {
  render: () => <AdminFilterBarDemo />,
}

export const WithSearchAndCount: Story = {
  render: () => <AdminFilterBarDemo withSearch withCount />,
}

export const EmptyState: Story = {
  render: () => {
    function EmptyDemo() {
      const [search, setSearch] = useState('')
      return (
        <AdminFilterBar
          filters={[
            {
              key: 'status',
              label: 'Status',
              options: [],
              selected: [],
              onChange: () => {},
              emptyText: 'No statuses available',
            },
          ]}
          search={{ value: search, onChange: setSearch }}
          resultCount={0}
          resultLabel="proposals"
        />
      )
    }
    return <EmptyDemo />
  },
}

export const ManyFilters: Story = {
  render: () => <AdminFilterBarDemo many />,
}

export const MobileViewport: Story = {
  render: () => <AdminFilterBarDemo many />,
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto w-[360px]">
        <Story />
      </div>
    ),
  ],
}
