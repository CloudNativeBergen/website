import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getEventDiscounts } from '@/lib/discounts'
import { SPONSOR_TIER_TICKET_ALLOCATION } from '@/lib/tickets/processor'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { DiscountCodeManager } from '@/components/admin/DiscountCodeManager'
import {
  TicketIcon,
  BuildingOfficeIcon,
  HomeIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

interface SponsorWithTierInfo {
  id: string
  name: string
  website: string
  logo: string
  tier: {
    title: string
    tagline: string
    tier_type: 'standard' | 'special'
  }
  ticketEntitlement: number
}

export default async function DiscountCodesAdminPage() {
  const {
    conference,
    domain,
    error: conferenceError,
  } = await getConferenceForCurrentDomain({
    sponsors: true,
    revalidate: 0,
  })

  if (
    conferenceError ||
    !conference.checkin_customer_id ||
    !conference.checkin_event_id
  ) {
    const missingFields = []
    if (!conference.checkin_customer_id) missingFields.push('Customer ID')
    if (!conference.checkin_event_id) missingFields.push('Event ID')

    return (
      <ErrorDisplay
        title="Checkin.no Configuration Error"
        message={
          conferenceError
            ? `Failed to load conference data: ${conferenceError.message}`
            : `Missing required Checkin.no configuration: ${missingFields.join(', ')}. Please configure these values in the conference settings to enable discount code management.`
        }
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  const sponsorsWithTierInfo: SponsorWithTierInfo[] =
    conference.sponsors?.map((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketEntitlement = SPONSOR_TIER_TICKET_ALLOCATION[tierTitle] || 0

      return {
        id: sponsorData.sponsor._id,
        name: sponsorData.sponsor.name,
        website: sponsorData.sponsor.website,
        logo: sponsorData.sponsor.logo || '',
        tier: {
          title: tierTitle,
          tagline: sponsorData.tier?.tagline || '',
          tier_type: (sponsorData.tier?.tier_type || 'standard') as
            | 'standard'
            | 'special',
        },
        ticketEntitlement,
      }
    }) || []

  let discounts
  try {
    const discountData = await getEventDiscounts(conference.checkin_event_id)
    discounts = discountData.discounts
  } catch (error) {
    return (
      <ErrorDisplay
        title="Failed to Load Discount Data"
        message={`Unable to fetch discount codes from Checkin.no: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your API credentials and event configuration.`}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  // Calculate sponsors with existing discounts using the same logic as DiscountCodeManager
  const sponsorsWithDiscounts = sponsorsWithTierInfo.filter((sponsor) => {
    return discounts.some((discount) =>
      discount.triggerValue
        ?.toLowerCase()
        .includes(sponsor.name.toLowerCase().replace(/\s+/g, '')),
    )
  })

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<TicketIcon />}
        title="Discount Code Management"
        description="Create and manage sponsor discount codes based on tier entitlements"
        contextHighlight={conference.title}
        stats={[
          {
            label: 'Total Sponsors',
            value: sponsorsWithTierInfo.length.toString(),
          },
          {
            label: 'Total Ticket Allowances',
            value: sponsorsWithTierInfo
              .reduce(
                (sum: number, s: SponsorWithTierInfo) =>
                  sum + s.ticketEntitlement,
                0,
              )
              .toString(),
          },
          {
            label: 'Sponsors with Codes',
            value: sponsorsWithDiscounts.length.toString(),
          },
          {
            label: 'Total Active Codes',
            value: discounts.length.toString(),
          },
        ]}
      />

      <div className="mt-8">
        <DiscountCodeManager
          sponsors={sponsorsWithTierInfo}
          eventId={conference.checkin_event_id}
          conference={{
            title: conference.title,
            city: conference.city,
            country: conference.country,
            start_date: conference.start_date,
            domains: conference.domains,
            social_links: conference.social_links,
            contact_email: conference.contact_email || conference.cfp_email,
            domain: domain,
          }}
        />
      </div>

      {/* Quick Actions */}
      <div className="mt-12">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/tickets"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <TicketIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Tickets Overview
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  View all ticket management tools
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/sponsors"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <BuildingOfficeIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Manage Sponsors
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Edit sponsor tiers and entitlements
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <HomeIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Back to Dashboard
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
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
