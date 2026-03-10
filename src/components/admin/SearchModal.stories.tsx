import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  HomeIcon,
} from '@heroicons/react/24/outline'
import { SkeletonSearchResult } from './LoadingSkeleton'

const meta = {
  title: 'Systems/Proposals/Admin/SearchModal',
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Command palette-style unified search modal (⌘K) for the admin interface. Uses a provider-based architecture with `useUnifiedSearch` hook to search across pages, proposals, speakers, and sponsors in parallel. Results are grouped by category with priority-based ordering.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SearchModalShell({
  query,
  children,
}: {
  query?: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-xl divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 dark:divide-gray-700 dark:bg-gray-900 dark:ring-gray-700">
      <div className="grid grid-cols-1">
        <input
          className="col-start-1 row-start-1 h-12 w-full pr-4 pl-11 text-base text-gray-900 outline-hidden placeholder:text-gray-400 sm:text-sm dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
          placeholder="Search pages, proposals, speakers, sponsors..."
          defaultValue={query}
          readOnly
        />
        <MagnifyingGlassIcon
          className="pointer-events-none col-start-1 row-start-1 ml-4 size-5 self-center text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
      </div>

      {children}

      <div className="flex flex-wrap items-center bg-gray-50 px-4 py-2.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <kbd className="mx-1 flex size-5 w-7 items-center justify-center gap-0.5 rounded border border-gray-400 bg-white font-semibold text-gray-900 sm:mx-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
          <span className="text-xs">⌘</span>K
        </kbd>
        <span className="ml-1">to open search</span>
        <span className="mx-2">&bull;</span>
        <kbd className="mx-1 flex size-5 items-center justify-center rounded border border-gray-400 bg-white font-semibold text-gray-900 sm:mx-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
          ↵
        </kbd>
        <span className="ml-1">to select</span>
        <span className="mx-2">&bull;</span>
        <kbd className="mx-1 flex size-5 w-7 items-center justify-center rounded border border-gray-400 bg-white font-semibold text-gray-900 sm:mx-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
          esc
        </kbd>
        <span className="ml-1">to close</span>
      </div>
    </div>
  )
}

interface ResultGroup {
  label: string
  items: {
    title: string
    subtitle?: string
    description?: string
    icon: React.ComponentType<{ className?: string }>
  }[]
}

function ResultsList({ groups }: { groups: ResultGroup[] }) {
  return (
    <ul className="max-h-80 space-y-4 overflow-y-auto p-4 pb-2">
      {groups.map((group) => (
        <li key={group.label}>
          <h2 className="text-xs font-semibold text-gray-900 dark:text-white">
            {group.label} ({group.items.length})
          </h2>
          <ul className="-mx-4 mt-2 text-sm text-gray-700 dark:text-gray-300">
            {group.items.map((item) => (
              <li
                key={item.title}
                className="flex cursor-default items-center px-4 py-2 select-none"
              >
                <div className="flex size-6 flex-none items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                  <item.icon className="size-4 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="ml-3 flex-auto truncate">
                  <div className="font-medium dark:text-white">
                    {item.title}
                  </div>
                  {item.subtitle && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.subtitle}
                    </div>
                  )}
                  {item.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.description}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

const MOCK_RESULTS: ResultGroup[] = [
  {
    label: 'Pages',
    items: [
      { title: 'Sponsors', icon: BuildingOfficeIcon },
      { title: 'Speakers', icon: UserGroupIcon },
    ],
  },
  {
    label: 'Proposals',
    items: [
      {
        title: 'Building Resilient Microservices with Kubernetes',
        subtitle: 'Jane Doe',
        description: 'Accepted',
        icon: DocumentTextIcon,
      },
      {
        title: 'Kubernetes Security Best Practices',
        subtitle: 'John Smith',
        description: 'Submitted',
        icon: DocumentTextIcon,
      },
    ],
  },
  {
    label: 'Speakers',
    items: [
      {
        title: 'Jane Kubernetes Expert',
        subtitle: 'Cloud Architect',
        icon: UserGroupIcon,
      },
    ],
  },
  {
    label: 'Sponsors',
    items: [
      {
        title: 'Kubernetes Foundation',
        subtitle: 'kubernetes.io',
        icon: BuildingOfficeIcon,
      },
    ],
  },
]

export const EmptyState: Story = {
  render: () => (
    <SearchModalShell>
      <div className="px-6 py-14 text-center text-sm sm:px-14">
        <DocumentTextIcon className="mx-auto size-6 text-gray-400 dark:text-gray-500" />
        <p className="mt-4 font-semibold text-gray-900 dark:text-white">
          Search across all admin pages and data
        </p>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Search through proposals, speakers, sponsors, pages, and more.
        </p>
      </div>
    </SearchModalShell>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Initial state before any search query is typed.',
      },
    },
  },
}

export const WithResults: Story = {
  render: () => (
    <SearchModalShell query="kubernetes">
      <ResultsList groups={MOCK_RESULTS} />
    </SearchModalShell>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Search results grouped into all 4 categories (Pages, Proposals, Speakers, Sponsors) with per-category icons and counts.',
      },
    },
  },
}

export const Loading: Story = {
  render: () => (
    <SearchModalShell query="kubernetes">
      <div className="max-h-80 transform-gpu scroll-py-10 scroll-pb-2 space-y-4 overflow-y-auto p-4 pb-2">
        <SkeletonSearchResult items={3} />
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Searching...
          </p>
        </div>
      </div>
    </SearchModalShell>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Loading state shown while providers fetch results in parallel. Uses skeleton placeholders.',
      },
    },
  },
}

export const NoResults: Story = {
  render: () => (
    <SearchModalShell query="xyznonexistent">
      <div className="px-6 py-14 text-center text-sm sm:px-14">
        <ExclamationTriangleIcon className="mx-auto size-6 text-gray-400 dark:text-gray-500" />
        <p className="mt-4 font-semibold text-gray-900 dark:text-white">
          No results found
        </p>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          We couldn&apos;t find anything matching &quot;xyznonexistent&quot;.
          Try different keywords.
        </p>
      </div>
    </SearchModalShell>
  ),
}

export const SearchError: Story = {
  render: () => (
    <SearchModalShell query="kubernetes">
      <div className="px-6 py-14 text-center text-sm sm:px-14">
        <ExclamationTriangleIcon className="mx-auto size-6 text-red-400" />
        <p className="mt-4 font-semibold text-gray-900 dark:text-white">
          Search Error
        </p>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Failed to perform search. Please try again.
        </p>
      </div>
    </SearchModalShell>
  ),
}

export const PagesOnly: Story = {
  render: () => (
    <SearchModalShell query="dashboard">
      <ResultsList
        groups={[
          {
            label: 'Pages',
            items: [{ title: 'Dashboard', icon: HomeIcon }],
          },
        ]}
      />
    </SearchModalShell>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'When only page results match (e.g. navigational queries), only the Pages group is shown.',
      },
    },
  },
}
