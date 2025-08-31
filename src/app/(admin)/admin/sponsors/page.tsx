import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ConferenceSponsorWithContact } from '@/lib/sponsor/types'
import { ErrorDisplay, SponsorActions } from '@/components/admin'
import SponsorTierEditor from '@/components/admin/SponsorTierEditor'
import SponsorTierManagement from '@/components/admin/SponsorTierManagement'
import { formatCurrency } from '@/lib/format'
import {
  BuildingOffice2Icon,
  GlobeAltIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

export default async function AdminSponsors() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
      sponsorContact: true,
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

  const sponsors: ConferenceSponsorWithContact[] = conference?.sponsors || []
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

  // Helper functions to check missing information
  const isMissingContactInfo = (
    sponsor: ConferenceSponsorWithContact,
  ): boolean => {
    return (
      !sponsor.sponsor.contact_persons ||
      sponsor.sponsor.contact_persons.length === 0
    )
  }

  const isMissingBillingInfo = (
    sponsor: ConferenceSponsorWithContact,
  ): boolean => {
    return !sponsor.sponsor.billing || !sponsor.sponsor.billing.email
  }

  // Count missing information
  const sponsorsWithMissingContactInfo = sponsors.filter(isMissingContactInfo)
  const sponsorsWithMissingBillingInfo = sponsors.filter(isMissingBillingInfo)
  const hasAnyMissingInfo =
    sponsorsWithMissingContactInfo.length > 0 ||
    sponsorsWithMissingBillingInfo.length > 0

  // Calculate summary statistics
  const availableTiers = sponsorTiers.length
  const formattedTotalValue = formatCurrency(
    totalSponsorshipValue,
    primaryCurrency,
  )

  return (
    <div className="mx-auto max-w-7xl">
      <div className="pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BuildingOffice2Icon className="h-8 w-8 text-brand-cloud-blue" />
            <div>
              <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight">
                Sponsor Management
              </h1>
              <p className="font-inter mt-2 text-sm text-brand-slate-gray/70">
                Manage conference sponsors and partnerships for{' '}
                <span className="font-medium text-brand-cloud-blue">
                  {conference.title}
                </span>
                . Coordinate sponsor relationships and billing information.
              </p>
            </div>
          </div>
        </div>

        <div className="font-inter mt-4 grid grid-cols-6 gap-3">
          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20">
            <div className="text-xl font-bold text-brand-slate-gray">
              {sponsors.length}
            </div>
            <div className="text-xs text-brand-slate-gray/70">
              Total sponsors
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20">
            <div className="text-xl font-bold text-brand-fresh-green">
              {formattedTotalValue}
            </div>
            <div className="text-xs text-brand-slate-gray/70">Total value</div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20">
            <div className="text-xl font-bold text-brand-cloud-blue">
              {availableTiers}
            </div>
            <div className="text-xs text-brand-slate-gray/70">
              Available tiers
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20">
            <div className="text-xl font-bold text-blue-600">
              {sponsorsWithMissingContactInfo.length}
            </div>
            <div className="text-xs text-brand-slate-gray/70">
              Missing contacts
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20">
            <div className="text-xl font-bold text-purple-600">
              {sponsorsWithMissingBillingInfo.length}
            </div>
            <div className="text-xs text-brand-slate-gray/70">
              Missing billing
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20">
            <div className="text-xl font-bold text-green-600">
              {
                sponsors.filter(
                  (sponsor) =>
                    !isMissingContactInfo(sponsor) &&
                    !isMissingBillingInfo(sponsor),
                ).length
              }
            </div>
            <div className="text-xs text-brand-slate-gray/70">
              Complete profiles
            </div>
          </div>
        </div>
      </div>

      {/* Sponsor Communications */}
      {sponsors.length > 0 && (
        <div className="mt-8">
          <SponsorActions
            sponsors={sponsors}
            conferenceTitle={conference.title}
            conferenceLocation={`${conference.city}, ${conference.country}`}
            conferenceDate={new Date(conference.start_date).toLocaleDateString(
              'en-US',
              {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              },
            )}
            conferenceUrl={`https://${conference.domains[0]}`}
            socialLinks={conference.social_links || []}
            contactEmail={conference.contact_email}
          />
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
            href="/admin/sponsors/contacts"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <UserGroupIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Sponsor Contacts
                </p>
                <p className="truncate text-sm text-gray-500">
                  Manage sponsor contact information
                </p>
              </div>
            </div>
          </Link>

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
