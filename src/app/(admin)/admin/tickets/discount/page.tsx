import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getEventDiscounts } from '@/lib/tickets/server'
import { TIER_TICKET_ALLOCATION } from '@/lib/tickets/calculations'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { DiscountCodeManager } from '@/components/admin/DiscountCodeManager'
import { TicketIcon } from '@heroicons/react/24/outline'

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
  // Get conference data to retrieve Checkin.no IDs and sponsors
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
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

  console.log('Using Checkin.no configuration:', {
    customer_id: conference.checkin_customer_id,
    event_id: conference.checkin_event_id,
    conference_title: conference.title,
  })

  // Prepare sponsor data with tier information
  const sponsorsWithTierInfo: SponsorWithTierInfo[] =
    conference.sponsors?.map((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketEntitlement = TIER_TICKET_ALLOCATION[tierTitle] || 0

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

  // Get discount codes data for stats calculation
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
        />
      </div>
    </div>
  )
}
