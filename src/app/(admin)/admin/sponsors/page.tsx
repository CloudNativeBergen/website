import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import SponsorTier from '@/components/admin/SponsorTier'
import {
  BuildingOffice2Icon,
  GlobeAltIcon,
  TagIcon,
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

    // Get the maximum price for each tier (in case there are multiple currencies)
    const maxPriceA = tierA ? Math.max(...tierA.price.map((p) => p.amount)) : 0
    const maxPriceB = tierB ? Math.max(...tierB.price.map((p) => p.amount)) : 0

    // Sort by highest value first
    return maxPriceB - maxPriceA
  })

  // Calculate total sponsorship value
  const totalSponsorshipValue = sponsors.reduce((total, sponsorData) => {
    if (sponsorData.tier) {
      const tier = sponsorTiers.find((t) => t.title === sponsorData.tier?.title)
      if (tier && tier.price.length > 0) {
        // Use the first price entry or the maximum price
        const tierValue = Math.max(...tier.price.map((p) => p.amount))
        return total + tierValue
      }
    }
    return total
  }, 0)

  // Get the primary currency (most common currency in sponsor tiers)
  const currencies = sponsorTiers.flatMap((tier) =>
    tier.price.map((p) => p.currency),
  )
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
        <div className="flex items-center gap-3">
          <BuildingOffice2Icon className="h-8 w-8 text-gray-400" />
          <div className="flex-1">
            <h1 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Sponsor Management
            </h1>
            <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                Manage conference sponsors and partnerships ({sponsors.length}{' '}
                active sponsors)
              </p>
              {totalSponsorshipValue > 0 && (
                <div className="mt-2 flex items-center space-x-2 sm:mt-0">
                  <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-gray-900">
                    Total Value: {totalSponsorshipValue.toLocaleString()}{' '}
                    {primaryCurrency}
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
                    {totalSponsorshipValue.toLocaleString()} {primaryCurrency}
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
        <SponsorTier
          conferenceId={conference?._id || ''}
          sponsorTiers={sponsorTiers}
        />
      </div>

      {/* Current Sponsors */}
      <div className="mt-12">
        <h2 className="mb-4 text-lg font-medium text-gray-900">
          Current Sponsors
        </h2>
        {sponsors.length === 0 ? (
          <div className="py-12 text-center">
            <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">
              No sponsors yet
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by reaching out to potential sponsors or promoting
              your sponsorship packages.
            </p>
            <div className="mt-6">
              <Link
                href="/sponsor"
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                View Sponsorship Page
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedTierNames.map((tierName) => {
              const tierSponsors = sponsorsByTier[tierName]
              const tier = sponsorTiers.find((t) => t.title === tierName)

              return (
                <div key={tierName}>
                  <div className="mb-4 flex items-center space-x-2">
                    <h3 className="text-md font-medium text-gray-900">
                      {tierName}
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                      {tierSponsors.length} sponsor
                      {tierSponsors.length !== 1 ? 's' : ''}
                    </span>
                    {tier?.tagline && (
                      <span className="text-sm text-gray-500">
                        • {tier.tagline}
                      </span>
                    )}
                    {tier && tier.price.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        <CurrencyDollarIcon className="mr-1 h-3 w-3" />
                        {Math.max(
                          ...tier.price.map((p) => p.amount),
                        ).toLocaleString()}{' '}
                        {tier.price[0].currency}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {tierSponsors.map((sponsorData, index) => {
                      const sponsor = sponsorData.sponsor
                      return (
                        <div
                          key={index}
                          className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400"
                        >
                          <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0">
                              {sponsor.logo ? (
                                <div
                                  className="flex h-12 w-12 items-center justify-center"
                                  dangerouslySetInnerHTML={{
                                    __html: sponsor.logo,
                                  }}
                                  style={{
                                    maxWidth: '48px',
                                    maxHeight: '48px',
                                  }}
                                />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                                  <BuildingOffice2Icon className="h-6 w-6 text-gray-400" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-sm font-medium text-gray-900">
                                {sponsor.name}
                              </h4>
                              {sponsor.website && (
                                <div className="mt-2">
                                  <a
                                    href={sponsor.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-sm text-gray-500 hover:text-indigo-600"
                                  >
                                    <GlobeAltIcon className="mr-1 h-4 w-4" />
                                    Visit Website
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-4">
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                <TagIcon className="mr-1 h-3 w-3" />
                                Active
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
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
