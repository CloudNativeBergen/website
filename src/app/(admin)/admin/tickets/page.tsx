import { fetchEventTickets, groupTicketsByOrder } from '@/lib/tickets/checkin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { ExpandableOrdersTable } from '@/components/admin/ExpandableOrdersTable'
import { TicketIcon } from '@heroicons/react/24/outline'
import type { EventTicket } from '@/lib/tickets/checkin'

export default async function AdminTickets() {
  let tickets: EventTicket[] = []
  let error: Error | null = null

  // Get conference data to retrieve Checkin.no IDs
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain()

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

  // Group tickets by order_id using the function from checkin.ts
  const orders = groupTicketsByOrder(tickets)

  // Calculate summary statistics from grouped orders (correct totals)
  const totalTickets = orders.reduce(
    (sum, order) => sum + order.totalTickets,
    0,
  )
  const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0)
  const uniqueCustomers = new Set(
    orders.flatMap((order) => order.tickets.map((ticket) => ticket.crm.email)),
  ).size

  // Calculate statistics by ticket category
  const ticketsByCategory = new Map<
    string,
    {
      count: number
      revenue: number
      orders: number
    }
  >()

  orders.forEach((order) => {
    order.categories.forEach((category) => {
      const current = ticketsByCategory.get(category) || {
        count: 0,
        revenue: 0,
        orders: 0,
      }
      ticketsByCategory.set(category, {
        count: current.count + order.totalTickets,
        revenue: current.revenue + order.totalAmount,
        orders: current.orders + 1,
      })
    })
  })

  const categoryStats = Array.from(ticketsByCategory.entries())
    .map(([category, stats]) => ({
      category,
      ...stats,
    }))
    .sort((a, b) => b.count - a.count)

  // Function to format numbers consistently for SSR
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="border-b border-gray-200 pb-5">
        <div className="flex items-center gap-3">
          <TicketIcon className="h-8 w-8 text-gray-400" />
          <div>
            <h1 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Ticket Management
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage sold tickets and attendee information ({orders.length}{' '}
              orders, {totalTickets} tickets)
            </p>
          </div>
        </div>
      </div>

      {/* Ticket Summary */}
      <div className="mt-8">
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5">
          <div className="px-6 py-4">
            <h2 className="mb-4 text-lg font-medium text-gray-900">
              Ticket Summary
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {orders.length}
                </div>
                <div className="text-sm text-gray-500">Total Orders</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {totalTickets}
                </div>
                <div className="text-sm text-gray-500">Total Tickets</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {formatCurrency(totalRevenue)} NOK
                </div>
                <div className="text-sm text-gray-500">Total Revenue</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600">
                  {uniqueCustomers}
                </div>
                <div className="text-sm text-gray-500">Unique Customers</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown by Ticket Type */}
      {categoryStats.length > 0 && (
        <div className="mt-8">
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5">
            <div className="px-6 py-4">
              <h2 className="mb-4 text-lg font-medium text-gray-900">
                Breakdown by Ticket Type
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                      >
                        Ticket Type
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                      >
                        Tickets Sold
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                      >
                        Orders
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                      >
                        Revenue
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                      >
                        Percentage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {categoryStats.map((stat) => (
                      <tr key={stat.category} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900">
                          {stat.category}
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                            {stat.count}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
                          {stat.orders}
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
                          <span className="font-medium text-green-600">
                            {formatCurrency(stat.revenue)} NOK
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
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

      {/* Orders List */}
      <div className="mt-12">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Orders</h2>
        {orders.length === 0 ? (
          <div className="py-12 text-center">
            <TicketIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">
              No orders found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
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
      <div className="mt-8 rounded-lg bg-gray-50 p-4">
        <h3 className="mb-2 text-sm font-medium text-gray-900">
          Debug Information
        </h3>
        <div className="space-y-1 text-xs text-gray-600">
          <div>Customer ID: {conference.checkin_customer_id}</div>
          <div>Event ID: {conference.checkin_event_id}</div>
          <div>API Response: {tickets.length} tickets loaded</div>
        </div>
      </div>
    </div>
  )
}
