import { fetchEventTickets } from '@/lib/tickets/checkin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import {
  TicketIcon,
  UserIcon,
  HashtagIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

// Define the EventTicket interface to match the one in checkin.ts
interface EventTicket {
  id: number
  sum: string
  category: string
  customer_name: string | null
  numberOfTickets: number
  sum_left: string
  fields: { key: string; value: string }[]
  crm: {
    first_name: string
    last_name: string
    email: string
  }
}

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

  // Calculate summary statistics
  const totalTickets = tickets.reduce(
    (sum, ticket) => sum + ticket.numberOfTickets,
    0,
  )
  const totalRevenue = tickets.reduce(
    (sum, ticket) => sum + (parseFloat(ticket.sum) || 0),
    0,
  )
  const uniqueCustomers = new Set(tickets.map((ticket) => ticket.crm.email))
    .size

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
              Manage sold tickets and attendee information ({tickets.length}{' '}
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
                  {tickets.length}
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

      {/* Tickets List */}
      <div className="mt-12">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Sold Tickets</h2>
        {tickets.length === 0 ? (
          <div className="py-12 text-center">
            <TicketIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">
              No tickets found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              No tickets have been sold for this event yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      Ticket ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      Customer & Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      Title & Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      Payment Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <HashtagIcon className="mr-2 h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {ticket.id}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <UserIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">
                              {ticket.crm.first_name} {ticket.crm.last_name}
                            </div>
                            {ticket.customer_name &&
                              ticket.customer_name !==
                                `${ticket.crm.first_name} ${ticket.crm.last_name}` && (
                                <div className="text-xs text-gray-500">
                                  {ticket.customer_name}
                                </div>
                              )}
                            <div className="mt-1 flex items-center">
                              <a
                                href={`mailto:${ticket.crm.email}`}
                                className="truncate text-xs text-indigo-600 hover:text-indigo-900"
                              >
                                {ticket.crm.email}
                              </a>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="min-w-0">
                          {(() => {
                            const workTitle = ticket.fields.find(
                              (f) => f.key === 'work_title',
                            )?.value
                            const company = ticket.fields.find(
                              (f) => f.key === 'company',
                            )?.value

                            if (!workTitle && !company) {
                              return (
                                <span className="text-sm text-gray-400">—</span>
                              )
                            }

                            return (
                              <div>
                                {workTitle && (
                                  <div className="text-sm font-medium text-gray-900">
                                    {workTitle}
                                  </div>
                                )}
                                {company && (
                                  <div className="mt-0.5 text-xs text-gray-600">
                                    {company}
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          {ticket.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <TicketIcon className="mr-2 h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-900">
                            {ticket.numberOfTickets}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {parseFloat(ticket.sum).toLocaleString()} NOK
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {parseFloat(ticket.sum_left) === 0.0 ? (
                          <div className="flex items-center">
                            <CheckCircleIcon className="mr-2 h-4 w-4 text-green-600" />
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                              Paid in Full
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <ExclamationTriangleIcon className="mr-2 h-4 w-4 text-amber-600" />
                            <div>
                              <div className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                Outstanding
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {ticket.sum_left.toLocaleString()} NOK remaining
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
