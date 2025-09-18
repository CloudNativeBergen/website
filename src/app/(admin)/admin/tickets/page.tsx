import { fetchEventTickets, groupTicketsByOrder } from '@/lib/tickets/server'
import {
  calculateTicketStatistics,
  SPONSOR_TIER_TICKET_ALLOCATION,
  createCategoryStatsForAdmin,
} from '@/lib/tickets/data-processing'
import { analyzeTicketSales } from '@/lib/tickets/target-calculations'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { ExpandableOrdersTable } from '@/components/admin/ExpandableOrdersTable'
import { TargetSetupGuide } from '@/components/admin/TargetSetupGuide'
import { TicketSalesChart } from '@/components/admin/TicketSalesChart'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { TicketIcon } from '@heroicons/react/24/outline'
import type { EventTicket } from '@/lib/tickets/server'
import { formatCurrency } from '@/lib/format'
import Link from 'next/link'

export default async function AdminTickets() {
  let tickets: EventTicket[] = []
  let error: Error | null = null

  // Get conference data to retrieve Checkin.no IDs and sponsors
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
            : `Missing required Checkin.no configuration: ${missingFields.join(', ')}. Please configure these values in the conference settings to enable ticket management.`
        }
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  try {
    tickets = await fetchEventTickets(
      conference.checkin_customer_id,
      conference.checkin_event_id,
    )

    console.log(tickets)
  } catch (err) {
    error = err as Error
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to Load Ticket Data"
        message={`Unable to fetch tickets from Checkin.no: ${error.message}. Please check your API credentials and try again.`}
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  // Calculate comprehensive ticket statistics using reusable function
  const stats = await calculateTicketStatistics(tickets, conference)

  // Analyze ticket targets if enabled and properly configured
  let ticketSales = null

  // Validate target configuration before analysis
  const config = conference.ticket_targets
  if (
    config?.enabled &&
    conference.ticket_capacity &&
    config.sales_start_date &&
    config.target_curve &&
    tickets.length > 0
  ) {
    try {
      ticketSales = analyzeTicketSales({
        capacity: conference.ticket_capacity,
        salesStartDate: config.sales_start_date,
        conferenceStartDate: conference.start_date,
        targetCurve: config.target_curve,
        milestones: config.milestones,
        tickets,
      })
    } catch (error) {
      console.log(
        'Target analysis calculation failed:',
        (error as Error).message,
      )
    }
  }

  // Group tickets by order_id for the orders table
  const orders = groupTicketsByOrder(tickets)

  // Create category stats with revenue and order information for admin display
  const categoryStats = createCategoryStatsForAdmin(
    tickets,
    orders,
    stats.ticketsByCategory,
  )

  // Extract calculated values from stats
  const totalTickets = stats.paidTickets
  const totalSponsorTickets = stats.sponsorTickets

  // Calculate sponsor tickets breakdown by tier for the admin table
  const sponsorTicketsByTier: Record<
    string,
    { sponsors: number; tickets: number }
  > = {}
  if (conference.sponsors && conference.sponsors.length > 0) {
    conference.sponsors.forEach((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketsForTier = SPONSOR_TIER_TICKET_ALLOCATION[tierTitle] || 0

      if (!sponsorTicketsByTier[tierTitle]) {
        sponsorTicketsByTier[tierTitle] = { sponsors: 0, tickets: 0 }
      }
      sponsorTicketsByTier[tierTitle].sponsors += 1
      sponsorTicketsByTier[tierTitle].tickets += ticketsForTier
    })
  }

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

      {/* Target Configuration Setup */}
      {!ticketSales && (
        <div className="mt-8">
          <TargetSetupGuide
            conferenceId={conference._id}
            hasCapacity={!!conference.ticket_capacity}
            hasTargetConfig={!!conference.ticket_targets?.enabled}
            currentCapacity={conference.ticket_capacity}
          />
        </div>
      )}

      {/* Ticket Target Tracking with Live Preview */}
      {ticketSales && (
        <TicketSalesChart
          conference={
            conference as import('@/lib/tickets/types').ConferenceWithTargets
          }
          targetAnalysis={ticketSales}
        />
      )}

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
                                {((stat.count / totalTickets) * 100).toFixed(1)}
                                %
                              </div>
                              <div className="h-2 w-16 rounded-full bg-gray-200">
                                <div
                                  className="h-2 rounded-full bg-blue-600"
                                  style={{
                                    width: `${(stat.count / totalTickets) * 100}%`,
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
      {totalSponsorTickets > 0 && (
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
                                      (tierData.tickets / totalSponsorTickets) *
                                      100
                                    ).toFixed(1)}
                                    %
                                  </div>
                                  <div className="h-2 w-16 rounded-full bg-gray-200">
                                    <div
                                      className="h-2 rounded-full bg-purple-600"
                                      style={{
                                        width: `${(tierData.tickets / totalSponsorTickets) * 100}%`,
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

      {/* Orders List */}
      <div className="mt-12">
        <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
          Orders
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

      {/* Debug Info */}
      <div className="mt-8 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
        <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
          Debug Information
        </h3>
        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
          <div>Customer ID: {conference.checkin_customer_id}</div>
          <div>Event ID: {conference.checkin_event_id}</div>
          <div>API Response: {tickets.length} tickets loaded</div>
          <div>Ticket Capacity: {conference.ticket_capacity || 'Not set'}</div>
          <div>
            Target Tracking Enabled:{' '}
            {conference.ticket_targets?.enabled ? 'Yes' : 'No'}
          </div>
          {conference.ticket_targets?.enabled && (
            <>
              <div>
                Sales Start Date:{' '}
                {conference.ticket_targets.sales_start_date || 'Not set'}
              </div>
              <div>
                Target Curve:{' '}
                {conference.ticket_targets.target_curve || 'linear'}
              </div>
              <div>
                Milestones: {conference.ticket_targets.milestones?.length || 0}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
