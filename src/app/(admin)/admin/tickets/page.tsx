import { fetchEventTickets, groupTicketsByOrder } from '@/lib/tickets/checkin'
import {
  calculateTicketStatistics,
  TIER_TICKET_ALLOCATION,
  createCategoryStatsForAdmin,
} from '@/lib/tickets/calculations'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { ExpandableOrdersTable } from '@/components/admin/ExpandableOrdersTable'
import { TicketIcon } from '@heroicons/react/24/outline'
import type { EventTicket } from '@/lib/tickets/checkin'
import { formatCurrency } from '@/lib/format'

export default async function AdminTickets() {
  let tickets: EventTicket[] = []
  let error: Error | null = null

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
    return (
      <ErrorDisplay
        title="Error Loading Conference Data"
        message={
          conferenceError
            ? conferenceError.message
            : 'Checkin.no Customer ID and Event ID must be configured in the conference settings'
        }
      />
    )
  }

  try {
    tickets = await fetchEventTickets(
      conference.checkin_customer_id,
      conference.checkin_event_id,
    )
  } catch (err) {
    error = err as Error
  }

  if (error) {
    return (
      <ErrorDisplay title="Error Loading Tickets" message={error.message} />
    )
  }

  // Calculate comprehensive ticket statistics using reusable function
  const stats = await calculateTicketStatistics(tickets, conference)

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
  const totalRevenue = stats.totalRevenue
  const totalSponsorTickets = stats.sponsorTickets
  const speakerTickets = stats.speakerTickets

  // Calculate sponsor tickets breakdown by tier for the admin table
  const sponsorTicketsByTier: Record<
    string,
    { sponsors: number; tickets: number }
  > = {}
  if (conference.sponsors && conference.sponsors.length > 0) {
    conference.sponsors.forEach((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketsForTier = TIER_TICKET_ALLOCATION[tierTitle] || 0

      if (!sponsorTicketsByTier[tierTitle]) {
        sponsorTicketsByTier[tierTitle] = { sponsors: 0, tickets: 0 }
      }
      sponsorTicketsByTier[tierTitle].sponsors += 1
      sponsorTicketsByTier[tierTitle].tickets += ticketsForTier
    })
  }

  const totalComplimentaryTickets = totalSponsorTickets + speakerTickets
  const totalTicketsIncludingAll = totalTickets + totalComplimentaryTickets

  return (
    <div className="mx-auto max-w-7xl">
      <div className="pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TicketIcon className="h-8 w-8 text-brand-cloud-blue dark:text-blue-300" />
            <div>
              <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight dark:text-white">
                Ticket Management
              </h1>
              <p className="font-inter mt-2 text-sm text-brand-slate-gray/70 dark:text-gray-400">
                Manage sold tickets and attendee information for{' '}
                <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
                  {conference.title}
                </span>
                . View orders, revenue, and allocation details.
              </p>
            </div>
          </div>
        </div>

        <div className="font-inter mt-4 grid grid-cols-6 gap-3">
          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
            <div className="text-xl font-bold text-brand-cloud-blue dark:text-blue-300">
              {orders.length}
            </div>
            <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
              Orders
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
            <div className="text-xl font-bold text-brand-slate-gray dark:text-white">
              {totalTickets}
            </div>
            <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
              Paid tickets
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
            <div className="text-xl font-bold text-brand-cloud-blue dark:text-blue-300">
              {totalSponsorTickets}
            </div>
            <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
              Sponsor tickets
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
            <div className="text-xl font-bold text-brand-nordic-purple dark:text-indigo-300">
              {speakerTickets}
            </div>
            <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
              Speaker tickets
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
            <div className="text-xl font-bold text-brand-fresh-green dark:text-green-300">
              {totalTicketsIncludingAll}
            </div>
            <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
              Total tickets
            </div>
          </div>

          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
            <div className="text-xl font-bold text-brand-fresh-green dark:text-green-300">
              {formatCurrency(totalRevenue)}
            </div>
            <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
              Total revenue
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown by Ticket Type */}
      {categoryStats.length > 0 && (
        <div className="mt-8">
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700">
            <div className="px-6 py-4">
              <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                Breakdown by Ticket Type
              </h2>
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
                                  {((stat.count / totalTickets) * 100).toFixed(
                                    1,
                                  )}
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
            </div>
          </div>
        </div>
      )}

      {/* Sponsor Tickets Breakdown */}
      {totalSponsorTickets > 0 && (
        <div className="mt-8">
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700">
            <div className="px-6 py-4">
              <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                Sponsor Ticket Allocations
              </h2>
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
                          TIER_TICKET_ALLOCATION[tierName] || 0

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
                                          totalSponsorTickets) *
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
                  sponsorship agreements. Pod sponsors receive 2 tickets,
                  Service sponsors receive 3 tickets, and Ingress sponsors
                  receive 5 tickets each. Speaker tickets are allocated one per
                  confirmed speaker.
                </p>
              </div>
            </div>
          </div>
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
        </div>
      </div>
    </div>
  )
}
