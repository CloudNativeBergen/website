import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  ChartBarIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  GlobeAltIcon,
  TagIcon,
  UserGroupIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import { StarIcon } from '@heroicons/react/20/solid'

const meta = {
  title: 'Systems/Sponsors/Admin/Tiers/SponsorTiersPage',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Integration example showing the full /admin/sponsors/tiers page layout. Combines AdminPageHeader, SponsorTierEditor (tier configuration cards), SponsorTierManagement (sponsors grouped by tier), and Quick Actions links.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface MockTier {
  _id: string
  title: string
  tagline: string
  tierType: 'standard' | 'addon'
  value: number
  maxQuantity?: number
  mostPopular?: boolean
  soldOut?: boolean
}

interface MockSponsor {
  name: string
  website: string
  logo: string | null
}

const tiers: MockTier[] = [
  {
    _id: 't1',
    title: 'Community Partner Package',
    tagline: 'The Base Image for the Norwegian Tech Ecosystem',
    tierType: 'standard',
    value: 25000,
    mostPopular: false,
  },
  {
    _id: 't2',
    title: 'Speakers Dinner',
    tagline: 'Exclusive Cluster Access',
    tierType: 'addon',
    value: 40000,
    maxQuantity: 1,
  },
  {
    _id: 't3',
    title: 'Barista Bar Sponsorship',
    tagline: 'Fueling the Garbage Collection',
    tierType: 'addon',
    value: 30000,
    maxQuantity: 1,
  },
  {
    _id: 't4',
    title: 'Lanyard Sponsorship',
    tagline: 'System-Wide Identity Provider',
    tierType: 'addon',
    value: 30000,
    maxQuantity: 1,
  },
  {
    _id: 't5',
    title: 'Afterparty Sponsorship',
    tagline: 'The Hero of the Night',
    tierType: 'addon',
    value: 25000,
    maxQuantity: 2,
  },
  {
    _id: 't6',
    title: 'Streaming & Video Sponsorship',
    tagline: 'Persistent Storage for Your Brand',
    tierType: 'addon',
    value: 25000,
    maxQuantity: 3,
  },
]

const sponsorsByTier: Record<string, MockSponsor[]> = {
  Platinum: [{ name: 'TechGiant Corp', website: 'techgiant.com', logo: null }],
  Gold: [
    { name: 'CloudPro Inc', website: 'cloudpro.io', logo: null },
    { name: 'DataSys', website: 'datasys.no', logo: null },
  ],
  Silver: [
    { name: 'StartupX', website: 'startupx.com', logo: null },
    { name: 'DevTools Ltd', website: 'devtools.io', logo: null },
  ],
  Bronze: [{ name: 'LocalBusiness', website: 'local.no', logo: null }],
}

const tierMeta: Record<
  string,
  { value: number; color: string; badge: string }
> = {
  Platinum: {
    value: 100000,
    color:
      'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-900/20',
    badge:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  Gold: {
    value: 50000,
    color:
      'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20',
    badge:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  Silver: {
    value: 25000,
    color: 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800',
    badge: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
  Bronze: {
    value: 10000,
    color:
      'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20',
    badge:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 0,
  }).format(value)
}

function SponsorCard({ sponsor }: { sponsor: MockSponsor }) {
  return (
    <div className="group flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          {sponsor.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {sponsor.name}
          </p>
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <GlobeAltIcon className="h-3 w-3" />
            {sponsor.website}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
          <PencilIcon className="h-4 w-4" />
        </button>
        <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
          <ArrowDownTrayIcon className="h-4 w-4" />
        </button>
        <button className="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20">
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}
        <AdminPageHeader
          icon={<ChartBarIcon className="h-full w-full" />}
          title="Sponsor Tiers"
          description="Configure sponsorship tiers and manage sponsor assignments for"
          contextHighlight="Cloud Native Days Norway 2026"
          backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
        />

        {/* Tier Editor Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Sponsor Tiers
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage sponsorship tiers and their pricing.
              </p>
            </div>
            <button className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
              <PlusIcon className="mr-1.5 h-4 w-4" />
              Create Tier
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier._id}
                className="group relative overflow-hidden rounded-lg border border-gray-300 bg-white p-6 shadow-sm hover:border-gray-400 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
              >
                {tier.maxQuantity === 1 && (
                  <div className="absolute top-4 -right-8 rotate-45 bg-linear-to-r from-amber-500 to-yellow-500 px-8 py-1 text-xs font-bold text-white shadow-sm">
                    Exclusive
                  </div>
                )}
                {tier.mostPopular && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-medium text-white">
                      <StarIcon className="mr-1 h-3 w-3" />
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="absolute top-4 right-4 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100">
                    <PencilIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center">
                  <TagIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                  <h4 className="ml-3 text-lg font-medium text-gray-900 dark:text-white">
                    {tier.title}
                    {tier.tierType === 'addon' ? ' (addon)' : ''}
                  </h4>
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {tier.tagline}
                </p>
                <div className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(tier.value)}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      tier.tierType === 'standard'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    }`}
                  >
                    {tier.tierType}
                  </span>
                  {tier.maxQuantity && tier.maxQuantity > 1 && (
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                      Limit: {tier.maxQuantity}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sponsor Tier Management Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Current Sponsors
            </h2>
            <button className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
              <PlusIcon className="mr-1 h-4 w-4" />
              Add Sponsor
            </button>
          </div>

          <div className="mt-6 space-y-6">
            {Object.entries(sponsorsByTier).map(([tierName, sponsors]) => {
              const meta = tierMeta[tierName]
              return (
                <div
                  key={tierName}
                  className={`rounded-xl border-2 p-6 ${meta.color}`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-semibold ${meta.badge}`}
                      >
                        {tierName}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatCurrency(meta.value)}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-500">
                        &bull; {sponsors.length} sponsor
                        {sponsors.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <button className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                      <PlusIcon className="h-4 w-4" />
                      Add Sponsor
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {sponsors.map((sponsor) => (
                      <SponsorCard key={sponsor.name} sponsor={sponsor} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-12">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Quick Actions
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700/50">
              <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/20">
                <UserGroupIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Sponsor Contacts
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Manage contact information
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700/50">
              <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/20">
                <TicketIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Sponsor Discount Codes
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Manage ticket discount codes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700/50">
              <div className="rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/20">
                <GlobeAltIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  View Sponsor Page
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Public sponsorship info
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const EmptyState: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<ChartBarIcon className="h-full w-full" />}
          title="Sponsor Tiers"
          description="Configure sponsorship tiers and manage sponsor assignments for"
          contextHighlight="Cloud Native Days Norway 2026"
          backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
        />

        {/* Empty tier editor */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Sponsor Tiers
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage sponsorship tiers and their pricing.
              </p>
            </div>
            <button className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
              <PlusIcon className="mr-1.5 h-4 w-4" />
              Create Tier
            </button>
          </div>
          <div className="mt-6 py-12 text-center">
            <TagIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No sponsor tiers
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Get started by creating your first sponsor tier.
            </p>
          </div>
        </div>

        {/* Empty sponsor management */}
        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Current Sponsors
            </h2>
          </div>
          <div className="mt-6 py-12 text-center">
            <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No sponsors yet
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Get started by adding your first sponsor to a tier.
            </p>
            <div className="mt-6">
              <button className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
                <PlusIcon className="mr-1 h-4 w-4" />
                Add Sponsor
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}
