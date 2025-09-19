import { fetchEventTickets, groupTicketsByOrder } from '@/lib/tickets/checkin'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type { ProcessTicketSalesInput, EventTicket } from '@/lib/tickets/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { Conference } from '@/lib/conference/types'
import {
  ErrorDisplay,
  AdminPageHeader,
  TicketAnalysisClient,
} from '@/components/admin'
import { ExpandableOrdersTable } from '@/components/admin/ExpandableOrdersTable'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { TicketIcon } from '@heroicons/react/24/outline'

import { formatCurrency } from '@/lib/format'
import {
  SPONSOR_TIER_TICKET_ALLOCATION,
  DEFAULT_TARGET_CONFIG,
  DEFAULT_CAPACITY,
} from '@/lib/tickets/config'
import {
  calculateCategoryStats,
  calculateSponsorTickets,
} from '@/lib/tickets/utils'
import Link from 'next/link'

async function getTicketData(conference: Conference) {
  if (!conference.checkin_customer_id || !conference.checkin_event_id) {
    throw new Error('Missing checkin configuration')
  }

  try {
    return await fetchEventTickets(
      conference.checkin_customer_id,
      conference.checkin_event_id,
    )
  } catch (error) {
    throw new Error(`Unable to fetch tickets: ${(error as Error).message}`)
  }
}

async function processTicketAnalysis(
  tickets: EventTicket[],
  conference: Conference,
) {
  const targetConfig = conference.ticket_targets || DEFAULT_TARGET_CONFIG
  const capacity = conference.ticket_capacity || DEFAULT_CAPACITY

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
        conference.start_date ||
        conference.program_date ||
        new Date().toISOString(),
    }

    const processor = new TicketSalesProcessor(input)
    return await processor.process()
  } catch (error) {
    console.error('Failed to process ticket analysis:', error)
    return null
  }
}

export default async function AdminTickets() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
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

  // Separate paid and free tickets
  const paidTickets = allTickets.filter((ticket) => parseFloat(ticket.sum) > 0)
  const freeTickets = allTickets.filter(
    (ticket) => parseFloat(ticket.sum) === 0,
  )

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to Load Ticket Data"
        message={error}
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  // Process analysis for both paid-only and all tickets
  const paidAnalysis = await processTicketAnalysis(paidTickets, conference)
  const allTicketsAnalysis = await processTicketAnalysis(allTickets, conference)

  // Orders table always shows all tickets (both paid and free)
  const orders = groupTicketsByOrder(allTickets)

  const statistics = paidAnalysis?.statistics || {
    totalPaidTickets: paidTickets.length,
    totalRevenue: paidTickets.reduce((sum, t) => sum + parseFloat(t.sum), 0),
    totalOrders: new Set(paidTickets.map((t) => t.order_id)).size,
    averageTicketPrice: 0,
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

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<TicketIcon />}
        title="Ticket Management"
        description="Manage sold tickets and attendee information for"
        contextHighlight={conference.title}
        stats={[]}
        actions={
          <Link
            href="/admin/tickets/discount"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Manage Discount Codes
          </Link>
        }
      />

      <TicketAnalysisClient
        ticketData={{
          allTickets,
          paidTickets,
          freeTickets,
        }}
        conference={{
          _id: conference._id,
          ticket_capacity: conference.ticket_capacity,
          ticket_targets: conference.ticket_targets,
        }}
        analysisData={{
          paidAnalysis,
          allTicketsAnalysis,
        }}
        defaultTargetConfig={DEFAULT_TARGET_CONFIG}
        defaultCapacity={DEFAULT_CAPACITY}
      />

      {/* Breakdown by Ticket Type */}
      {categoryStats.length > 0 && (
        <div className="mt-8">
          <CollapsibleSection
            title="Breakdown by Ticket Type"
            defaultOpen={false}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Ticket Type
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Tickets Sold
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Orders
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Revenue
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Percentage
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                  {categoryStats.map((stat) => (
                    <tr
                      key={stat.category}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900 dark:text-white">
                        {stat.category}
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                          {stat.count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                        {stat.orders}
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(stat.revenue)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                        <div className="flex items-center">
                          <div className="flex-1">
                            <div className="flex items-center">
                              <div className="mr-2 text-xs">
                                {stat.percentage.toFixed(1)}%
                              </div>
                              <div className="h-2 w-16 rounded-full bg-gray-200">
                                <div
                                  className="h-2 rounded-full bg-blue-600"
                                  style={{
                                    width: `${stat.percentage}%`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Sponsor Tickets Breakdown */}
      {statistics.sponsorTickets > 0 && (
        <div className="mt-8">
          <CollapsibleSection
            title="Sponsor Ticket Allocations"
            defaultOpen={false}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Sponsor Tier
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Sponsors
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Tickets per Sponsor
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Total Tickets
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      Percentage
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                  {Object.entries(sponsorTicketsByTier)
                    .sort(([, a], [, b]) => b.tickets - a.tickets)
                    .map(([tierName, tierData]) => {
                      const ticketsPerSponsor =
                        SPONSOR_TIER_TICKET_ALLOCATION[tierName] || 0

                      return (
                        <tr
                          key={tierName}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <td className="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900 dark:text-white">
                            {tierName}
                          </td>
                          <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                              {tierData.sponsors}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                            {ticketsPerSponsor}
                          </td>
                          <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                            <span className="font-medium text-purple-600 dark:text-purple-400">
                              {tierData.tickets}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                            <div className="flex items-center">
                              <div className="flex-1">
                                <div className="flex items-center">
                                  <div className="mr-2 text-xs">
                                    {(
                                      (tierData.tickets /
                                        statistics.sponsorTickets) *
                                      100
                                    ).toFixed(1)}
                                    %
                                  </div>
                                  <div className="h-2 w-16 rounded-full bg-gray-200">
                                    <div
                                      className="h-2 rounded-full bg-purple-600"
                                      style={{
                                        width: `${(tierData.tickets / statistics.sponsorTickets) * 100}%`,
                                      }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
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

      {/* Orders List - Always shows all tickets (paid and free) */}
      <div className="mt-12">
        <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
          Orders (All Tickets)
        </h2>
        {orders.length === 0 ? (
          <div className="py-12 text-center">
            <TicketIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No orders found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No tickets have been sold for this event yet.
            </p>
          </div>
        ) : (
          <ExpandableOrdersTable
            orders={orders}
            customerId={conference.checkin_customer_id}
            eventId={conference.checkin_event_id}
          />
        )}
      </div>
    </div>
  )
}
