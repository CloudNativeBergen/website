import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  fetchTicketTypesFromCheckin,
  getTicketSaleStatus,
  formatTicketPrice,
  stripHtml,
  type PublicTicketType,
} from '@/lib/tickets/public'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { TicketIcon } from '@heroicons/react/24/outline'

function StatusBadge({
  status,
}: {
  status: 'expired' | 'active' | 'upcoming'
}) {
  const styles = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    expired: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    upcoming:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  )
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function TicketTypesAdminPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

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
            : `Missing required Checkin.no configuration: ${missingFields.join(', ')}. Please configure these in the conference settings.`
        }
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  let tickets: PublicTicketType[] = []
  let error: string | null = null

  try {
    const data = await fetchTicketTypesFromCheckin(conference.checkinEventId)
    tickets = data.tickets.sort((a, b) => a.position - b.position)
  } catch (err) {
    error = (err as Error).message
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to Load Ticket Types"
        message={error}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<TicketIcon />}
        title="Ticket Types"
        description="All ticket types configured in Checkin.no for"
        contextHighlight={conference.title}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />

      <div className="space-y-4">
        {tickets.map((ticket) => {
          const status = getTicketSaleStatus(ticket)
          const currency = ticket.price[0]?.key?.toUpperCase() || 'NOK'

          return (
            <div
              key={ticket.id}
              className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <TicketIcon className="h-5 w-5 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {ticket.name}
                  </h3>
                  <StatusBadge status={status} />
                  {ticket.requiresInvitation && (
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                      Invite-only
                    </span>
                  )}
                </div>
                <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                  ID: {ticket.id} &middot; Position: {ticket.position}
                </div>
              </div>

              {ticket.description && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {stripHtml(ticket.description)}
                </p>
              )}

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Pricing */}
                <div>
                  <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    Pricing
                  </dt>
                  <dd className="mt-1">
                    {ticket.price.length > 0 ? (
                      <div className="space-y-1">
                        {ticket.price.map((p, i) => {
                          const excl = formatTicketPrice(p.price, p.vat)
                          const incl = formatTicketPrice(p.price, p.vat, {
                            includeVat: true,
                          })
                          return (
                            <div key={i} className="text-sm">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {currency} {excl}
                              </span>
                              <span className="ml-1 text-gray-500 dark:text-gray-400">
                                ({incl} incl. {p.vat}% VAT)
                              </span>
                              {p.description && (
                                <span className="ml-1 text-xs text-gray-400">
                                  — {p.description}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">
                        No pricing set
                      </span>
                    )}
                  </dd>
                </div>

                {/* Availability */}
                <div>
                  <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    Availability
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {ticket.available !== null ? (
                      <span>
                        {ticket.available}{' '}
                        <span className="text-gray-500 dark:text-gray-400">
                          remaining
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400">Unlimited</span>
                    )}
                  </dd>
                </div>

                {/* Visibility Window */}
                <div>
                  <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    Visible From
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {formatDate(ticket.visibleStartsAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    Visible Until
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {formatDate(ticket.visibleEndsAt)}
                  </dd>
                </div>
              </div>

              {/* Type */}
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Type: <span className="font-mono">{ticket.type}</span>
                </span>
              </div>
            </div>
          )
        })}

        {tickets.length === 0 && (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
            <TicketIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No ticket types found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No ticket types are configured in Checkin.no for this event.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
