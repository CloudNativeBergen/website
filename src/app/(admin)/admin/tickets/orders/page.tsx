import { fetchEventTickets, groupTicketsByOrder } from '@/lib/tickets/api'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { EventTicket } from '@/lib/tickets/types'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { OrdersTableWithSearch } from '@/components/admin/OrdersTableWithSearch'
import {
  TicketIcon,
  ShoppingBagIcon,
  HomeIcon,
  CreditCardIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

async function getTicketData(
  customerId: number,
  eventId: number,
): Promise<EventTicket[]> {
  try {
    return await fetchEventTickets(customerId, eventId)
  } catch (error) {
    throw new Error(`Unable to fetch tickets: ${(error as Error).message}`)
  }
}

export default async function OrdersAdminPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

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
            : `Missing required Checkin.no configuration: ${missingFields.join(', ')}. Please configure these values in the conference settings to enable order management.`
        }
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  let allTickets: EventTicket[] = []
  let error: string | null = null

  try {
    allTickets = await getTicketData(
      conference.checkin_customer_id,
      conference.checkin_event_id,
    )
  } catch (err) {
    error = (err as Error).message
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to Load Order Data"
        message={`Unable to fetch orders from Checkin.no: ${error}. Please check your API credentials and event configuration.`}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  const orders = groupTicketsByOrder(allTickets)

  const paidTickets = allTickets.filter((ticket) => parseFloat(ticket.sum) > 0)
  const freeTickets = allTickets.filter(
    (ticket) => parseFloat(ticket.sum) === 0,
  )
  const pendingPayments = orders.filter((order) => order.amountLeft > 0)

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<ShoppingBagIcon />}
        title="Order Management"
        description="View and manage ticket orders for"
        contextHighlight={conference.title}
        stats={[
          {
            label: 'Total Orders',
            value: orders.length.toString(),
          },
          {
            label: 'Total Tickets',
            value: allTickets.length.toString(),
          },
          {
            label: 'Pending Payments',
            value: pendingPayments.length.toString(),
          },
          {
            label: 'Free Tickets',
            value: freeTickets.length.toString(),
          },
          {
            label: 'Paid Tickets',
            value: paidTickets.length.toString(),
          },
        ]}
      />

      <div className="mt-12">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            All Orders
          </h2>
        </div>

        {orders.length === 0 ? (
          <div className="py-12 text-center">
            <ShoppingBagIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No orders found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No tickets have been sold for this event yet.
            </p>
          </div>
        ) : (
          <OrdersTableWithSearch
            orders={orders}
            customerId={conference.checkin_customer_id}
            eventId={conference.checkin_event_id}
          />
        )}
      </div>

      <div className="mt-12">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/tickets/companies"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <BuildingOfficeIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Company Breakdown
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  View companies attending
                </p>
              </div>
            </div>
          </Link>

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
                  Ticket Analytics
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  View sales performance and analytics
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
