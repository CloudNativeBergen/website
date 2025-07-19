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
                  {totalRevenue.toLocaleString()} NOK
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
