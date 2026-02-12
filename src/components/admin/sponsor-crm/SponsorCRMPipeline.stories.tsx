import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  Squares2X2Icon,
  TagIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Admin/Sponsors/Pipeline/SponsorCRMPipeline',
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const PIPELINE_STATUSES = [
  { id: 'prospect', label: 'Prospect', color: 'bg-gray-100 text-gray-700' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-100 text-blue-700' },
  {
    id: 'negotiating',
    label: 'Negotiating',
    color: 'bg-amber-100 text-amber-700',
  },
  { id: 'confirmed', label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  { id: 'declined', label: 'Declined', color: 'bg-red-100 text-red-700' },
]

interface MockSponsor {
  id: string
  name: string
  tier: string
  tags: string[]
  assignee: string
  value?: number
}

const mockSponsors: Record<string, MockSponsor[]> = {
  prospect: [
    {
      id: '1',
      name: 'TechCorp AS',
      tier: 'Gold',
      tags: ['returning'],
      assignee: 'Hans',
      value: 50000,
    },
    {
      id: '2',
      name: 'CloudSoft Inc',
      tier: '',
      tags: ['priority'],
      assignee: 'Maria',
    },
  ],
  contacted: [
    {
      id: '3',
      name: 'DataSys Norge',
      tier: 'Silver',
      tags: [],
      assignee: 'Hans',
      value: 25000,
    },
  ],
  negotiating: [
    {
      id: '4',
      name: 'DevTools Pro',
      tier: 'Platinum',
      tags: ['returning'],
      assignee: 'Erik',
      value: 100000,
    },
    {
      id: '5',
      name: 'OpenSource Labs',
      tier: 'Community',
      tags: ['community'],
      assignee: 'Sofia',
    },
  ],
  confirmed: [
    {
      id: '6',
      name: 'MegaCorp',
      tier: 'Platinum',
      tags: ['returning'],
      assignee: 'Hans',
      value: 100000,
    },
    {
      id: '7',
      name: 'StartupX',
      tier: 'Gold',
      tags: [],
      assignee: 'Maria',
      value: 50000,
    },
    {
      id: '8',
      name: 'Local Business',
      tier: 'Bronze',
      tags: ['local'],
      assignee: 'Erik',
      value: 10000,
    },
  ],
  declined: [
    {
      id: '9',
      name: 'OtherCo',
      tier: '',
      tags: [],
      assignee: 'Sofia',
    },
  ],
}

function getTierColor(tier: string) {
  switch (tier.toLowerCase()) {
    case 'platinum':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    case 'gold':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'silver':
      return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    case 'bronze':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    case 'community':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
}

function SponsorCardPreview({ sponsor }: { sponsor: MockSponsor }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between">
        <h4 className="font-medium text-gray-900 dark:text-white">
          {sponsor.name}
        </h4>
        {sponsor.tier && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTierColor(sponsor.tier)}`}
          >
            {sponsor.tier}
          </span>
        )}
      </div>
      {sponsor.value && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {new Intl.NumberFormat('nb-NO', {
            style: 'currency',
            currency: 'NOK',
            maximumFractionDigits: 0,
          }).format(sponsor.value)}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1">
          {sponsor.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
          {sponsor.assignee[0]}
        </div>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Sponsor Pipeline
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cloud Native Days Bergen 2025
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search sponsors..."
                className="w-64 rounded-lg border border-gray-300 bg-white py-2 pr-4 pl-10 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:text-gray-300">
              <FunnelIcon className="h-4 w-4" />
              Filters
            </button>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600">
              <button className="rounded-l-lg bg-indigo-50 px-3 py-2 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                <Squares2X2Icon className="h-4 w-4" />
              </button>
              <button className="px-3 py-2 text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700">
                <TagIcon className="h-4 w-4" />
              </button>
              <button className="rounded-r-lg px-3 py-2 text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700">
                <CurrencyDollarIcon className="h-4 w-4" />
              </button>
            </div>
            <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <PlusIcon className="h-4 w-4" />
              Add Sponsor
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto p-6">
        {PIPELINE_STATUSES.map((status) => (
          <div key={status.id} className="w-72 shrink-0">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-sm font-medium ${status.color}`}
                >
                  {status.label}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {mockSponsors[status.id]?.length || 0}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {mockSponsors[status.id]?.map((sponsor) => (
                <SponsorCardPreview key={sponsor.id} sponsor={sponsor} />
              ))}
              {(!mockSponsors[status.id] ||
                mockSponsors[status.id].length === 0) && (
                <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  No sponsors
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorCRMPipeline
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Main Kanban board for managing sponsors through the sales pipeline.
          Supports drag-and-drop status changes, multiple view modes, search,
          and filtering.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conferenceId
            </code>{' '}
            - Conference to manage sponsors for
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conference
            </code>{' '}
            - Full conference object with tiers
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              domain
            </code>{' '}
            - Conference domain for links
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              externalNewTrigger
            </code>{' '}
            - Counter to trigger new sponsor form
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          View Modes
        </h3>
        <ul className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <strong>Pipeline</strong> - Status-based columns (Prospect →
            Confirmed)
          </li>
          <li>
            <strong>Tier</strong> - Group by sponsor tier (Platinum, Gold, etc.)
          </li>
          <li>
            <strong>Invoice</strong> - Group by invoice status
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• Drag-and-drop between columns</li>
          <li>• Quick search by sponsor name</li>
          <li>• Filter by status, tier, tags, assignee</li>
          <li>• Bulk selection and actions</li>
          <li>• Click card to open edit modal</li>
          <li>• Quick email action on cards</li>
          <li>• Real-time data with tRPC</li>
        </ul>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200">Note</h3>
        <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
          This component has complex dependencies including tRPC queries,
          drag-and-drop context, and URL state management. The story above shows
          a static preview of the UI layout.
        </p>
      </div>
    </div>
  ),
}
