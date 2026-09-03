import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ticketEntitlementOf } from '@/lib/tickets/entitlement'
import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
} from '@/lib/tickets/admin-access'
import {
  ErrorDisplay,
  AdminPageHeader,
  TicketingStateNotice,
  type TicketingNoticeState,
} from '@/components/admin'
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
    // The sponsor discount email defaults its ticket URL to this link, so this
    // page is one of the two surfaces allowed to read it. See the option's doc.
    includeSponsorRegistrationLink: true,
  })

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={`Failed to load conference data: ${conferenceError.message}`}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  const access = await resolveTicketingAdminAccess(conference)
  const providerLabel = ticketingProviderLabel(access.providerType)

  // Discount codes are a CHECKIN-ONLY API end to end — the manager, the tRPC
  // procedures and the provider interface all key on a numeric Checkin event id,
  // and the Tito provider raises `ProviderUnsupportedError` for them. So a Tito
  // conference gets an honest "not supported by this vendor" state rather than a
  // manager whose every call fails.
  const noticeState: TicketingNoticeState | null =
    access.state !== 'ready' ? access.state : null

  // A `ready` Checkin conference always has both ids (the resolver requires
  // them), so this is only absent for Tito — and it narrows the id for the
  // Checkin-shaped manager below.
  const checkinEventId =
    access.state === 'ready' && access.providerType === 'checkin'
      ? conference.checkinEventId
      : undefined

  if (noticeState || !checkinEventId) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<TicketIcon />}
          title="Discount Code Management"
          description="Create and manage sponsor discount codes based on tier entitlements"
          contextHighlight={conference.title}
          backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
        />
        <TicketingStateNotice
          state={noticeState ?? 'unsupported'}
          providerLabel={providerLabel}
          surface="discount codes"
        />
      </div>
    )
  }

  const sponsorsWithTierInfo: SponsorWithTierInfo[] =
    conference.sponsors?.map((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketEntitlement = ticketEntitlementOf(sponsorData.tier)

      return {
        id: sponsorData.sponsor._id,
        name: sponsorData.sponsor.name,
        website: sponsorData.sponsor.website,
        logo: sponsorData.sponsor.logo || '',
        tier: {
          title: tierTitle,
          tagline: sponsorData.tier?.tagline || '',
          tierType: (sponsorData.tier?.tierType || 'standard') as
            'standard' | 'special',
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
          eventId={checkinEventId}
          providerLabel={providerLabel}
          conference={{
            title: conference.title,
            city: conference.city,
            country: conference.country,
            startDate: conference.startDate,
            domains: conference.domains,
            socialLinks: conference.socialLinks,
            contactEmail: conference.contactEmail || conference.cfpEmail,
            domain: domain,
            theme: conference.theme,
            registrationLink: conference.registrationLink,
            sponsorRegistrationLink: conference.sponsorRegistrationLink,
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
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-xs hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
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
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-xs hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
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
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-xs hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
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
