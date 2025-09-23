import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ConferenceSponsorWithContact } from '@/lib/sponsor/types'
import {
  ErrorDisplay,
  SponsorActions,
  AdminPageHeader,
} from '@/components/admin'
import SponsorTierEditor from '@/components/admin/SponsorTierEditor'
import SponsorTierManagement from '@/components/admin/SponsorTierManagement'
import { formatCurrency } from '@/lib/format'
import {
  BuildingOffice2Icon,
  GlobeAltIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

export default async function AdminSponsors() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
      sponsorContact: true,
      sponsorTiers: true,
      revalidate: 0,
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

  Object.keys(sponsorsByTier).forEach((tierTitle) => {
    sponsorsByTier[tierTitle].sort((a, b) =>
      a.sponsor.name.localeCompare(b.sponsor.name),
    )
  })

  const sortedTierNames = Object.keys(sponsorsByTier).sort((a, b) => {
    if (a === 'No Tier') return 1
    if (b === 'No Tier') return -1

    const tierA = sponsorTiers.find((tier) => tier.title === a)
    const tierB = sponsorTiers.find((tier) => tier.title === b)

    if (tierA?.tier_type === 'special' && tierB?.tier_type === 'special') {
      return a.localeCompare(b)
    }
    if (tierA?.tier_type === 'special') return 1
    if (tierB?.tier_type === 'special') return -1

    const maxPriceA = tierA?.price
      ? Math.max(...tierA.price.map((p) => p.amount))
      : 0
    const maxPriceB = tierB?.price
      ? Math.max(...tierB.price.map((p) => p.amount))
      : 0

    return maxPriceB - maxPriceA
  })

  const totalSponsorshipValue = sponsors.reduce((total, sponsorData) => {
    if (sponsorData.tier && sponsorData.tier.tier_type !== 'special') {
      const tier = sponsorTiers.find((t) => t.title === sponsorData.tier?.title)
      if (tier && tier.price && tier.price.length > 0) {
        const tierValue = Math.max(...tier.price.map((p) => p.amount))
        return total + tierValue
      }
    }
    return total
  }, 0)

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

  const sponsorsWithMissingContactInfo = sponsors.filter(isMissingContactInfo)
  const sponsorsWithMissingBillingInfo = sponsors.filter(isMissingBillingInfo)

  const availableTiers = sponsorTiers.length
  const formattedTotalValue = formatCurrency(
    totalSponsorshipValue,
    primaryCurrency,
  )

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<BuildingOffice2Icon />}
        title="Sponsor Management"
        description={
          <>
            Manage conference sponsors and partnerships for{' '}
            <span className="font-medium text-brand-cloud-blue">
              {conference.title}
            </span>
            . Coordinate sponsor relationships and billing information.
          </>
        }
        stats={[
          {
            value: sponsors.length,
            label: 'Total sponsors',
            color: 'slate',
          },
          {
            value: formattedTotalValue,
            label: 'Total value',
            color: 'green',
          },
          {
            value: availableTiers,
            label: 'Available tiers',
            color: 'blue',
          },
          {
            value: sponsorsWithMissingContactInfo.length,
            label: 'Missing contacts',
            color: 'blue',
          },
          {
            value: sponsorsWithMissingBillingInfo.length,
            label: 'Missing billing',
            color: 'purple',
          },
          {
            value: sponsors.filter(
              (sponsor) =>
                !isMissingContactInfo(sponsor) &&
                !isMissingBillingInfo(sponsor),
            ).length,
            label: 'Complete profiles',
            color: 'green',
          },
        ]}
      />

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

      <div className="mt-8">
        <SponsorTierEditor
          conferenceId={conference?._id || ''}
          sponsorTiers={sponsorTiers}
        />
      </div>

      <div className="mt-12">
        <SponsorTierManagement
          sponsors={sponsors}
          sponsorTiers={sponsorTiers}
          sponsorsByTier={sponsorsByTier}
          sortedTierNames={sortedTierNames}
        />
      </div>

      <div className="mt-12">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/sponsors/contacts"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <UserGroupIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Sponsor Contacts
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Manage sponsor contact information
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/tickets/discount"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg
                  className="h-6 w-6 text-gray-400 dark:text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125V15.75a2.999 2.999 0 0 1 0-5.198V8.376c0-.621-.504-1.125-1.125-1.125H3.375Z"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Sponsor Discount Codes
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Manage and distribute ticket discount codes
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/sponsor"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <GlobeAltIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  View Sponsor Page
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  See the public sponsorship information
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
