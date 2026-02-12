import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ArrowDownTrayIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Admin/Sponsors/Tiers/SponsorTierManagement',
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface MockSponsor {
  _id: string
  sponsor: {
    name: string
    website?: string
    logo: string | null
  }
  tier: { title: string }
}

interface MockTier {
  _id: string
  title: string
  value: number
  perks?: string[]
}

const mockTiers: MockTier[] = [
  {
    _id: 'tier-1',
    title: 'Platinum',
    value: 100000,
    perks: ['Keynote slot', 'Premium booth', 'Logo on all materials'],
  },
  {
    _id: 'tier-2',
    title: 'Gold',
    value: 50000,
    perks: ['Workshop slot', 'Standard booth', 'Logo on website'],
  },
  {
    _id: 'tier-3',
    title: 'Silver',
    value: 25000,
    perks: ['Logo on website', 'Social media mention'],
  },
  { _id: 'tier-4', title: 'Bronze', value: 10000, perks: ['Logo on website'] },
]

const mockSponsors: MockSponsor[] = [
  {
    _id: 'sfc-1',
    sponsor: {
      name: 'TechGiant Corp',
      website: 'https://techgiant.com',
      logo: null,
    },
    tier: { title: 'Platinum' },
  },
  {
    _id: 'sfc-2',
    sponsor: {
      name: 'CloudPro Inc',
      website: 'https://cloudpro.io',
      logo: null,
    },
    tier: { title: 'Gold' },
  },
  {
    _id: 'sfc-3',
    sponsor: { name: 'DataSys', website: 'https://datasys.no', logo: null },
    tier: { title: 'Gold' },
  },
  {
    _id: 'sfc-4',
    sponsor: { name: 'StartupX', website: 'https://startupx.com', logo: null },
    tier: { title: 'Silver' },
  },
  {
    _id: 'sfc-5',
    sponsor: {
      name: 'DevTools Ltd',
      website: 'https://devtools.io',
      logo: null,
    },
    tier: { title: 'Silver' },
  },
  {
    _id: 'sfc-6',
    sponsor: { name: 'LocalBusiness', website: 'https://local.no', logo: null },
    tier: { title: 'Bronze' },
  },
]

function getTierColor(tier: string) {
  switch (tier.toLowerCase()) {
    case 'platinum':
      return 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-900/20'
    case 'gold':
      return 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
    case 'silver':
      return 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800'
    case 'bronze':
      return 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20'
    default:
      return 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800'
  }
}

function getTierBadgeColor(tier: string) {
  switch (tier.toLowerCase()) {
    case 'platinum':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    case 'gold':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'silver':
      return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    case 'bronze':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }
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
          {sponsor.sponsor.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {sponsor.sponsor.name}
          </p>
          {sponsor.sponsor.website && (
            <a
              href={sponsor.sponsor.website}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GlobeAltIcon className="h-3 w-3" />
              {sponsor.sponsor.website.replace(/^https?:\/\//, '')}
            </a>
          )}
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
    <div className="min-h-screen bg-gray-100 p-6 dark:bg-gray-900">
      <div className="mx-auto max-w-6xl space-y-6">
        {mockTiers.map((tier) => {
          const tierSponsors = mockSponsors.filter(
            (s) => s.tier.title === tier.title,
          )
          return (
            <div
              key={tier._id}
              className={`rounded-xl border-2 p-6 ${getTierColor(tier.title)}`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${getTierBadgeColor(tier.title)}`}
                  >
                    {tier.title}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {formatCurrency(tier.value)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-500">
                    • {tierSponsors.length} sponsor
                    {tierSponsors.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                  <PlusIcon className="h-4 w-4" />
                  Add Sponsor
                </button>
              </div>

              {tierSponsors.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {tierSponsors.map((sponsor) => (
                    <SponsorCard key={sponsor._id} sponsor={sponsor} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No sponsors in this tier yet
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  ),
}

export const SingleTier: Story = {
  render: () => {
    const tier = mockTiers[1] // Gold
    const tierSponsors = mockSponsors.filter((s) => s.tier.title === tier.title)

    return (
      <div className="p-6">
        <div className={`rounded-xl border-2 p-6 ${getTierColor(tier.title)}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${getTierBadgeColor(tier.title)}`}
              >
                {tier.title}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {formatCurrency(tier.value)}
              </span>
            </div>
            <button className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <PlusIcon className="h-4 w-4" />
              Add Sponsor
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {tierSponsors.map((sponsor) => (
              <SponsorCard key={sponsor._id} sponsor={sponsor} />
            ))}
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
          SponsorTierManagement
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Displays sponsors organized by tier with add, edit, and remove
          functionality. Supports drag-and-drop tier reassignment (not shown in
          static demo).
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
              sponsors
            </code>{' '}
            - Array of ConferenceSponsor objects
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              sponsorTiers
            </code>{' '}
            - Available tier definitions
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              sponsorsByTier
            </code>{' '}
            - Pre-grouped sponsors by tier name
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              sortedTierNames
            </code>{' '}
            - Tier names sorted by value (highest first)
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• Tier sections sorted by value (highest first)</li>
          <li>• Color-coded tier badges and backgrounds</li>
          <li>• Add sponsor to specific tier via modal</li>
          <li>• Edit existing sponsor assignments</li>
          <li>• Download sponsor logos (SVG)</li>
          <li>• Remove sponsor from conference</li>
          <li>• Real-time state updates</li>
        </ul>
      </div>
    </div>
  ),
}
