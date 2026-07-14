import { fetchEventTickets } from '@/lib/tickets/api'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type { ProcessTicketSalesInput, EventTicket } from '@/lib/tickets/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { Conference } from '@/lib/conference/types'
import {
  ErrorDisplay,
  AdminPageHeader,
  TicketAnalysisClient,
} from '@/components/admin'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import {
  FreeTicketAllocationTable,
  CategoryBreakdownTable,
  SponsorAllocationTable,
} from './TicketBreakdownTables'
import {
  TicketIcon,
  ShoppingBagIcon,
  HomeIcon,
  CreditCardIcon,
  DocumentTextIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline'

import {
  SPONSOR_TIER_TICKET_ALLOCATION,
  DEFAULT_TARGET_CONFIG,
  DEFAULT_CAPACITY,
} from '@/lib/tickets/config'
import {
  calculateCategoryStats,
  calculateSponsorTickets,
  calculateFreeTicketAllocation,
  calculateTicketStatistics,
  deduplicateTicketsByEmail,
} from '@/lib/tickets/utils'
import { getSpeakers, getOrganizerCount } from '@/lib/speaker/sanity'
import { Status } from '@/lib/proposal/types'
import Link from 'next/link'

async function getTicketData(conference: Conference) {
  if (!conference.checkinCustomerId || !conference.checkinEventId) {
    throw new Error('Missing checkin configuration')
  }

  try {
    return await fetchEventTickets(
      conference.checkinCustomerId,
      conference.checkinEventId,
    )
  } catch (error) {
    throw new Error(`Unable to fetch tickets: ${(error as Error).message}`)
  }
}

async function processTicketAnalysis(
  tickets: EventTicket[],
  conference: Conference,
  speakerCount: number,
) {
  const targetConfig = conference.ticketTargets || DEFAULT_TARGET_CONFIG
  const capacity = conference.ticketCapacity || DEFAULT_CAPACITY

  if (tickets.length === 0) return null

  try {
    const input: ProcessTicketSalesInput = {
      tickets: tickets.map((t) => ({
        order_id: t.order_id,
        order_date: t.order_date,
        category: t.category,
        sum: t.sum,
      })),
      config: targetConfig,
      capacity,
      conference,
      conferenceDate:
        conference.startDate ||
        conference.programDate ||
        new Date().toISOString(),
      speakerCount,
    }

    const processor = new TicketSalesProcessor(input)
    return processor.process()
  } catch (error) {
    console.error('Failed to process ticket analysis:', error)
    return null
  }
}

export default async function AdminTickets() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
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
            : `Missing required Checkin.no configuration: ${missingFields.join(', ')}`
        }
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  let allTickets: EventTicket[] = []
  let error: string | null = null

  try {
    allTickets = await getTicketData(conference)
  } catch (err) {
    error = (err as Error).message
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to Load Ticket Data"
        message={error}
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  const paidTickets = allTickets.filter((t) => parseFloat(t.sum) > 0)
  const freeTickets = allTickets.filter((t) => parseFloat(t.sum) === 0)

  const uniquePaidTickets = deduplicateTicketsByEmail(paidTickets)
  const uniqueFreeTickets = deduplicateTicketsByEmail(freeTickets)
  const uniqueAllTickets = deduplicateTicketsByEmail(allTickets)

  const { speakers: confirmedSpeakers } = await getSpeakers(
    conference._id,
    [Status.confirmed],
    false,
  )
  const { count: organizerCount } = await getOrganizerCount()

  const paidOnlyAnalysis = await processTicketAnalysis(
    paidTickets,
    conference,
    confirmedSpeakers.length,
  )
  const allTicketsAnalysis = await processTicketAnalysis(
    allTickets,
    conference,
    confirmedSpeakers.length,
  )

  const basicStats = calculateTicketStatistics(paidTickets)
  const statistics = paidOnlyAnalysis?.statistics || {
    ...basicStats,
    categoryBreakdown: {},
    sponsorTickets: 0,
    speakerTickets: 0,
    totalCapacityUsed: paidTickets.length,
  }

  const categoryStats = calculateCategoryStats(
    paidTickets,
    statistics.totalPaidTickets,
  )
  const sponsorTicketsByTier = calculateSponsorTickets(
    conference,
    SPONSOR_TIER_TICKET_ALLOCATION,
  )

  const freeTicketAllocation = calculateFreeTicketAllocation(
    conference,
    SPONSOR_TIER_TICKET_ALLOCATION,
    confirmedSpeakers.length,
    organizerCount,
    freeTickets,
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<TicketIcon />}
        title="Ticket Management"
        description="Manage sold tickets and attendee information for"
        contextHighlight={conference.title}
        actionItems={[
          {
            label: 'Page Content',
            href: '/admin/tickets/content',
            icon: <DocumentTextIcon className="h-4 w-4" />,
          },
          {
            label: 'Ticket Types',
            href: '/admin/tickets/types',
            icon: <QueueListIcon className="h-4 w-4" />,
          },
          {
            label: 'Orders',
            href: '/admin/tickets/orders',
            icon: <ShoppingBagIcon className="h-4 w-4" />,
          },
          {
            label: 'Discounts',
            href: '/admin/tickets/discount',
            icon: <CreditCardIcon className="h-4 w-4" />,
          },
        ]}
      />

      <TicketAnalysisClient
        ticketData={{
          allTickets,
          paidTickets,
          freeTickets,
        }}
        uniqueTicketData={{
          uniqueAllTickets,
          uniquePaidTickets,
          uniqueFreeTickets,
        }}
        conference={{
          _id: conference._id,
          ticketCapacity: conference.ticketCapacity,
          ticketTargets: conference.ticketTargets,
        }}
        analysisData={{
          paidAnalysis: paidOnlyAnalysis,
          allTicketsAnalysis,
        }}
        freeTicketAllocation={freeTicketAllocation}
        defaultTargetConfig={DEFAULT_TARGET_CONFIG}
        defaultCapacity={DEFAULT_CAPACITY}
      />

      <div>
        <CollapsibleSection
          title="Free Ticket Allocation & Usage"
          defaultOpen={true}
        >
          <FreeTicketAllocationTable allocation={freeTicketAllocation} />
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong>Note:</strong> Free tickets are allocated to sponsors
              based on their tier (Pod: 2, Service: 3, Ingress: 5), one per
              confirmed speaker, and one per organizer. The &quot;claimed&quot;
              count shows how many free tickets have been registered in the
              system.
            </p>
          </div>
        </CollapsibleSection>
      </div>

      {categoryStats.length > 0 && (
        <div>
          <CollapsibleSection
            title="Breakdown by Ticket Type"
            defaultOpen={false}
          >
            <CategoryBreakdownTable stats={categoryStats} />
          </CollapsibleSection>
        </div>
      )}

      {/* Sponsor Tickets Breakdown */}
      {statistics.sponsorTickets > 0 && (
        <div>
          <CollapsibleSection
            title="Sponsor Ticket Allocations"
            defaultOpen={false}
          >
            <SponsorAllocationTable
              tierData={sponsorTicketsByTier}
              totalSponsorTickets={statistics.sponsorTickets}
            />
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              <p>
                <strong>Note:</strong> Sponsor tickets are allocated through
                sponsorship agreements. Pod sponsors receive 2 tickets, Service
                sponsors receive 3 tickets, and Ingress sponsors receive 5
                tickets each. Speaker tickets are allocated one per confirmed
                speaker.
              </p>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/tickets/content"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <DocumentTextIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Page Content
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Configure the public tickets page
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/tickets/types"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <QueueListIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Ticket Types
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  View all ticket type configurations
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/tickets/orders"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <ShoppingBagIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Order Management
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  View and manage all ticket orders
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/tickets/discount"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <CreditCardIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Discount Codes
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Manage sponsor discount codes
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
