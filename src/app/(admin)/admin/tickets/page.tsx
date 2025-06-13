import { fetchEventTickets } from '@/lib/tickets/checkin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { TicketIcon, UserIcon, HashtagIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

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
  const { conference, error: conferenceError } = await getConferenceForCurrentDomain()

  if (conferenceError || !conference.checkin_customer_id || !conference.checkin_event_id) {
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
    tickets = await fetchEventTickets(conference.checkin_customer_id, conference.checkin_event_id)
  } catch (err) {
    error = err as Error
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Error Loading Tickets"
        message={error.message}
      />
    )
  }

  // Calculate summary statistics
  const totalTickets = tickets.reduce((sum, ticket) => sum + ticket.numberOfTickets, 0)
  const totalRevenue = tickets.reduce((sum, ticket) => sum + (parseFloat(ticket.sum) || 0), 0)
  const uniqueCustomers = new Set(tickets.map(ticket => ticket.crm.email)).size

  return (
    <div className="mx-auto max-w-7xl">
      <div className="border-b border-gray-200 pb-5">
        <div className="flex items-center gap-3">
          <TicketIcon className="h-8 w-8 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Ticket Management
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage sold tickets and attendee information ({tickets.length} orders, {totalTickets} tickets)
            </p>
          </div>
        </div>
      </div>

      {/* Ticket Summary */}
      <div className="mt-8">
        <div className="bg-white overflow-hidden shadow-sm ring-1 ring-gray-900/5 rounded-lg">
          <div className="px-6 py-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Ticket Summary</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{tickets.length}</div>
                <div className="text-sm text-gray-500">Total Orders</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{totalTickets}</div>
                <div className="text-sm text-gray-500">Total Tickets</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{totalRevenue.toLocaleString()} NOK</div>
                <div className="text-sm text-gray-500">Total Revenue</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600">{uniqueCustomers}</div>
                <div className="text-sm text-gray-500">Unique Customers</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="mt-12">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Sold Tickets</h2>
        {tickets.length === 0 ? (
          <div className="text-center py-12">
            <TicketIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No tickets found</h3>
            <p className="mt-1 text-sm text-gray-500">
              No tickets have been sold for this event yet.
            </p>
          </div>
        ) : (
          <div className="bg-white shadow-sm ring-1 ring-gray-900/5 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Ticket ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Customer & Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Title & Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Payment Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <HashtagIcon className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">{ticket.id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <UserIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">
                              {ticket.crm.first_name} {ticket.crm.last_name}
                            </div>
                            {ticket.customer_name && ticket.customer_name !== `${ticket.crm.first_name} ${ticket.crm.last_name}` && (
                              <div className="text-xs text-gray-500">{ticket.customer_name}</div>
                            )}
                            <div className="flex items-center mt-1">
                              <a
                                href={`mailto:${ticket.crm.email}`}
                                className="text-xs text-indigo-600 hover:text-indigo-900 truncate"
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
                            const workTitle = ticket.fields.find(f => f.key === 'work_title')?.value
                            const company = ticket.fields.find(f => f.key === 'company')?.value

                            if (!workTitle && !company) {
                              return <span className="text-sm text-gray-400">—</span>
                            }

                            return (
                              <div>
                                {workTitle && (
                                  <div className="text-sm font-medium text-gray-900">
                                    {workTitle}
                                  </div>
                                )}
                                {company && (
                                  <div className="text-xs text-gray-600 mt-0.5">
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
                          <TicketIcon className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{ticket.numberOfTickets}</span>
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
                            <CheckCircleIcon className="h-4 w-4 text-green-600 mr-2" />
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                              Paid in Full
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 mr-2" />
                            <div>
                              <div className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                Outstanding
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
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
      <div className="mt-8 bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Debug Information</h3>
        <div className="text-xs text-gray-600 space-y-1">
          <div>Customer ID: {conference.checkin_customer_id}</div>
          <div>Event ID: {conference.checkin_event_id}</div>
          <div>API Response: {tickets.length} tickets loaded</div>
        </div>
      </div>
    </div>
  )
}
