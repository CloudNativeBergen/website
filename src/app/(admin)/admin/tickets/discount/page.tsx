import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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
  website?: string
  logo?: string
  tier: {
    title: string
    tagline: string
    tierType: 'standard' | 'special'
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
  })

  if (
    conferenceError ||
    !conference.checkinCustomerId ||
    !conference.checkinEventId
  ) {
    const missingFields = []
    if (!conference.checkinCustomerId) missingFields.push('Customer ID')
    if (!conference.checkinEventId) missingFields.push('Event ID')

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
          tierType: (sponsorData.tier?.tierType || 'standard') as
            | 'standard'
            | 'special',
        },
        ticketEntitlement,
      }
    }) || []

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<TicketIcon />}
        title="Discount Code Management"
        description="Create and manage sponsor discount codes based on tier entitlements"
        contextHighlight={conference.title}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />

      <div>
        <DiscountCodeManager
          sponsors={sponsorsWithTierInfo}
          eventId={conference.checkinEventId}
          conference={{
            title: conference.title,
            city: conference.city,
            country: conference.country,
            startDate: conference.startDate,
            domains: conference.domains,
            socialLinks: conference.socialLinks,
            contactEmail: conference.contactEmail || conference.cfpEmail,
            domain: domain,
          }}
        />
      </div>

      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/tickets"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
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
              <div className="shrink-0">
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
              <div className="shrink-0">
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
