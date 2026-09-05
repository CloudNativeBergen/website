import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatDateTimeSafe } from '@/lib/time'
import {
  getTicketSaleStatus,
  formatTicketPrice,
  isPublicFreeTicketType,
  stripHtml,
  type PublicTicketType,
} from '@/lib/tickets/public'
import { PublicFreeTicketToggle } from '@/components/admin/PublicFreeTicketToggle'
import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
} from '@/lib/tickets/admin-access'
import {
  ErrorDisplay,
  AdminPageHeader,
  TicketingStateNotice,
} from '@/components/admin'
import { TicketIcon } from '@heroicons/react/24/outline'
import { EmptyState } from '@/components/EmptyState'
import {
  StatusBadge as SharedStatusBadge,
  type BadgeColor,
} from '@/components/StatusBadge'

function StatusBadge({
  status,
}: {
  status: 'expired' | 'active' | 'upcoming'
}) {
  const config: Record<
    'expired' | 'active' | 'upcoming',
    { label: string; color: BadgeColor }
  > = {
    active: { label: 'Active', color: 'green' },
    expired: { label: 'Expired', color: 'gray' },
    upcoming: { label: 'Upcoming', color: 'yellow' },
  }
  const { label, color } = config[status]
  return <SharedStatusBadge label={label} color={color} />
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return formatDateTimeSafe(dateStr)
}

export default async function TicketTypesAdminPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={`Failed to load conference data: ${conferenceError.message}`}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  // Provider-aware: the resolver reads whichever binding this conference's
  // vendor uses, so a Tito-bound conference lists ITS ticket types instead of
  // being refused for missing Checkin ids. It also replaces the silent empty
  // render that a credential-less org used to get — an unresolvable provider is
  // not "this event has no ticket types".
  const access = await resolveTicketingAdminAccess(conference)
  const providerLabel = ticketingProviderLabel(access.providerType)

  if (access.state !== 'ready') {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<TicketIcon />}
          title="Ticket Types"
          description="Ticket types for"
          contextHighlight={conference.title}
          backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
        />
        <TicketingStateNotice
          state={access.state}
          providerLabel={providerLabel}
          surface="ticket types"
        />
      </div>
    )
  }

  let tickets: PublicTicketType[] = []
  let error: string | null = null

  try {
    // The provider-shaped eventRef (not a bare Checkin event id), so Tito routes
    // to its account/event slugs.
    const data = await access.provider.fetchPublicTicketTypes(access.eventRef)
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
        description={`All ticket types configured in ${providerLabel} for`}
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
                    <SharedStatusBadge label="Invite-only" color="purple" />
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

              {/* Type + public free-tier opt-in (#860). The toggle appears only
                  on types the opt-in can actually publish — the same predicate
                  `resolveDisplayTickets` filters on — so admin and policy agree
                  on what "free" means. */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Type: <span className="font-mono">{ticket.type}</span>
                </span>
                {isPublicFreeTicketType(ticket) && (
                  <PublicFreeTicketToggle
                    ticketId={ticket.id}
                    ticketName={ticket.name}
                    initialVisible={
                      conference.publicFreeTicketIds?.includes(ticket.id) ??
                      false
                    }
                  />
                )}
              </div>
            </div>
          )
        })}

        {tickets.length === 0 && (
          <EmptyState
            icon={TicketIcon}
            title="No ticket types found"
            description={`No ticket types are configured in ${providerLabel} for this event.`}
            className="rounded-lg bg-white p-12 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
          />
        )}
      </div>
    </div>
  )
}
