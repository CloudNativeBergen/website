import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import SponsorTierEditor from '@/components/admin/SponsorTierEditor'
import SponsorTierManagement from '@/components/admin/SponsorTierManagement'
import { formatCurrency } from '@/lib/format'
import {
  BuildingOffice2Icon,
  GlobeAltIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

export default async function AdminSponsors() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
      sponsorTiers: true,
    })

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  const sponsors = conference?.sponsors || []
  const sponsorTiers = conference?.sponsor_tiers || []

  // Group sponsors by tier
  const sponsorsByTier = sponsors.reduce(
    (acc, sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'No Tier'
      if (!acc[tierTitle]) {
        acc[tierTitle] = []
      }
      acc[tierTitle].push(sponsorData)
      return acc
    },
    {} as Record<string, typeof sponsors>,
  )

  // Sort tier names by priority (highest value first, then "No Tier")
  const sortedTierNames = Object.keys(sponsorsByTier).sort((a, b) => {
    if (a === 'No Tier') return 1
    if (b === 'No Tier') return -1

    // Find the tier objects
    const tierA = sponsorTiers.find((tier) => tier.title === a)
    const tierB = sponsorTiers.find((tier) => tier.title === b)

    // Handle special sponsors separately
    if (tierA?.tier_type === 'special' && tierB?.tier_type === 'special') {
      return a.localeCompare(b)
    }
    if (tierA?.tier_type === 'special') return 1 // Special sponsors go last
    if (tierB?.tier_type === 'special') return -1

    // Get the maximum price for each tier (in case there are multiple currencies)
    const maxPriceA = tierA?.price
      ? Math.max(...tierA.price.map((p) => p.amount))
      : 0
    const maxPriceB = tierB?.price
      ? Math.max(...tierB.price.map((p) => p.amount))
      : 0

    // Sort by highest value first
    return maxPriceB - maxPriceA
  })

  // Calculate total sponsorship value (only from standard sponsors with pricing)
  const totalSponsorshipValue = sponsors.reduce((total, sponsorData) => {
    if (sponsorData.tier && sponsorData.tier.tier_type !== 'special') {
      const tier = sponsorTiers.find((t) => t.title === sponsorData.tier?.title)
      if (tier && tier.price && tier.price.length > 0) {
        // Use the first price entry or the maximum price
        const tierValue = Math.max(...tier.price.map((p) => p.amount))
        return total + tierValue
      }
    }
    return total
  }, 0)

  // Get the primary currency (most common currency in sponsor tiers)
  const currencies = sponsorTiers
    .filter((tier) => tier.price)
    .flatMap((tier) => tier.price!.map((p) => p.currency))
  const primaryCurrency =
    currencies.length > 0
      ? currencies.reduce((a, b, i, arr) =>
          arr.filter((v) => v === a).length >= arr.filter((v) => v === b).length
            ? a
            : b,
        )
      : 'NOK'

  return (
    <div className="mx-auto max-w-7xl">
      <div className="border-b border-gray-200 pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <BuildingOffice2Icon className="h-8 w-8 text-gray-400" />
          <div className="flex-1">
            <h1 className="text-xl leading-7 font-bold text-gray-900 sm:text-2xl sm:tracking-tight lg:truncate lg:text-3xl">
              Sponsor Management
            </h1>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                Manage conference sponsors and partnerships ({sponsors.length}{' '}
                active sponsors)
              </p>
              {totalSponsorshipValue > 0 && (
                <div className="flex items-center space-x-2 sm:mt-0">
                  <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-gray-900">
                    Total Value:{' '}
                    {formatCurrency(totalSponsorshipValue, primaryCurrency)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sponsorship Summary */}
      {sponsors.length > 0 && (
        <div className="mt-8">
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5">
            <div className="px-6 py-4">
              <h2 className="mb-4 text-lg font-medium text-gray-900">
                Sponsorship Summary
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">
                    {sponsors.length}
                  </div>
                  <div className="text-sm text-gray-500">Total Sponsors</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {formatCurrency(totalSponsorshipValue, primaryCurrency)}
                  </div>
                  <div className="text-sm text-gray-500">Total Value</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600">
                    {sponsorTiers.length}
                  </div>
                  <div className="text-sm text-gray-500">Available Tiers</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editable Sponsor Tiers */}
      <div className="mt-8">
        <SponsorTierEditor
          conferenceId={conference?._id || ''}
          sponsorTiers={sponsorTiers}
        />
      </div>

      {/* Sponsor Management */}
      <div className="mt-12">
        <SponsorTierManagement
          sponsors={sponsors}
          sponsorTiers={sponsorTiers}
          sponsorsByTier={sponsorsByTier}
          sortedTierNames={sortedTierNames}
        />
      </div>

      {/* Quick Actions */}
      <div className="mt-12">
        <h2 className="text-lg font-medium text-gray-900">Quick Actions</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/sponsor"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <GlobeAltIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  View Sponsor Page
                </p>
                <p className="truncate text-sm text-gray-500">
                  See the public sponsorship information
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <BuildingOffice2Icon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Back to Dashboard
                </p>
                <p className="truncate text-sm text-gray-500">
                  Return to the main admin dashboard
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
