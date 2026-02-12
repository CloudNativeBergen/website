import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  UserIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Proposals/Admin/SearchModal',
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Command palette-style search modal for quickly finding proposals by title, speaker name, description, or topic. Uses `useProposalSearch` hook with debounced search. Results are grouped into Talks and Workshops sections. Keyboard shortcuts: ⌘K to open, ↵ to select, Esc to close.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function MockSearchModal({
  state,
}: {
  state: 'empty' | 'results' | 'no-results' | 'error'
}) {
  return (
    <div className="mx-auto w-full max-w-xl divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 dark:divide-gray-700 dark:bg-gray-900 dark:ring-gray-700">
      {/* Search input */}
      <div className="grid grid-cols-1">
        <input
          className="col-start-1 row-start-1 h-12 w-full pr-4 pl-11 text-base text-gray-900 outline-hidden placeholder:text-gray-400 sm:text-sm dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
          placeholder="Search proposals, speakers, topics..."
          defaultValue={state !== 'empty' ? 'kubernetes' : ''}
          readOnly
        />
        <MagnifyingGlassIcon
          className="pointer-events-none col-start-1 row-start-1 ml-4 size-5 self-center text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
      </div>

      {/* Empty state */}
      {state === 'empty' && (
        <div className="px-6 py-14 text-center text-sm sm:px-14">
          <DocumentTextIcon className="mx-auto size-6 text-gray-400 dark:text-gray-500" />
          <p className="mt-4 font-semibold text-gray-900 dark:text-white">
            Search proposals
          </p>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Search through proposal titles, descriptions, speaker names, topics,
            and more.
          </p>
        </div>
      )}

      {/* Results */}
      {state === 'results' && (
        <ul className="max-h-80 space-y-4 overflow-y-auto p-4 pb-2">
          <li>
            <h2 className="text-xs font-semibold text-gray-900 dark:text-white">
              Talks (2)
            </h2>
            <ul className="-mx-4 mt-2 text-sm text-gray-700 dark:text-gray-300">
              {[
                {
                  title: 'Building Resilient Microservices with Kubernetes',
                  speaker: 'Jane Doe',
                  status: 'Accepted',
                  statusClass: 'bg-green-50 text-green-700 ring-green-600/20',
                },
                {
                  title: 'Kubernetes Security Best Practices',
                  speaker: 'John Smith',
                  status: 'Submitted',
                  statusClass: 'bg-blue-50 text-blue-700 ring-blue-600/20',
                },
              ].map((proposal) => (
                <li
                  key={proposal.title}
                  className="flex cursor-default items-center px-4 py-2 select-none"
                >
                  <div className="flex size-6 flex-none items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                    <UserIcon className="size-4 text-gray-400 dark:text-gray-500" />
                  </div>
                  <div className="ml-3 flex-auto truncate">
                    <div className="font-medium dark:text-white">
                      {proposal.title}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        by {proposal.speaker}
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${proposal.statusClass}`}
                      >
                        {proposal.status}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <h2 className="text-xs font-semibold text-gray-900 dark:text-white">
              Workshops (1)
            </h2>
            <ul className="-mx-4 mt-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex cursor-default items-center px-4 py-2 select-none">
                <div className="flex size-6 flex-none items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                  <UserIcon className="size-4 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="ml-3 flex-auto truncate">
                  <div className="font-medium dark:text-white">
                    Hands-on Kubernetes Workshop
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      by Alice Johnson
                    </div>
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                      Confirmed
                    </span>
                  </div>
                </div>
              </li>
            </ul>
          </li>
        </ul>
      )}

      {/* No results */}
      {state === 'no-results' && (
        <div className="px-6 py-14 text-center text-sm sm:px-14">
          <ExclamationTriangleIcon className="mx-auto size-6 text-gray-400 dark:text-gray-500" />
          <p className="mt-4 font-semibold text-gray-900 dark:text-white">
            No proposals found
          </p>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            We couldn&apos;t find any proposals matching &quot;kubernetes&quot;.
            Try different keywords.
          </p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="px-6 py-14 text-center text-sm sm:px-14">
          <ExclamationTriangleIcon className="mx-auto size-6 text-red-400" />
          <p className="mt-4 font-semibold text-gray-900 dark:text-white">
            Search Error
          </p>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Failed to search proposals. Please try again.
          </p>
        </div>
      )}

      {/* Footer */}
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

export const EmptyState: Story = {
  render: () => <MockSearchModal state="empty" />,
  parameters: {
    docs: {
      description: {
        story: 'Initial state before any search query is typed.',
      },
    },
  },
}

export const WithResults: Story = {
  render: () => <MockSearchModal state="results" />,
  parameters: {
    docs: {
      description: {
        story:
          'Search results grouped into Talks and Workshops sections, with speaker avatars and status badges.',
      },
    },
  },
}

export const NoResults: Story = {
  render: () => <MockSearchModal state="no-results" />,
}

export const SearchError: Story = {
  render: () => <MockSearchModal state="error" />,
}
